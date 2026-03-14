import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseAvailable, isPrismaConnectionError, prisma } from "../db/prisma.js";
import generateTokenAndSetCookie from "../utils/generateToken.js";
import { toUserDto } from "../utils/formatters.js";
import { mapResolvedFeatureFlag } from "../utils/featureFlags.js";
import { emitPublicUserUpdated } from "../utils/realtime.js";
import { buildEmailVerificationEmail, buildPasswordResetEmail, buildUsernameReminderEmail } from "../utils/emailTemplates.js";
import { createRecoveryToken, hashRecoveryToken } from "../utils/recoveryTokens.js";
import { ensureEmailDeliveryIsConfigured, sendTransactionalEmail } from "../utils/resend.js";
import { SESSION_COOKIE_NAME, createVerificationToken } from "../utils/authSecurity.js";
import { createRequestSecurityEvent } from "../utils/securityEvents.js";
import { createTwoFactorSetup, verifyTwoFactorCode } from "../utils/twoFactor.js";
import {
	createUserSessionRecord,
	getActiveUserSessionByTokenId,
	revokeUserSession,
	touchUserSession,
} from "../utils/userSessions.js";
import { buildUsernameInsensitiveLookup, normalizeUsername, USERNAME_PATTERN } from "../utils/usernames.js";
import {
	DEVELOPER_ROLE,
	getRoleForNewAccount,
	isPrimaryDeveloperUsername,
	shouldBootstrapDeveloper,
} from "../utils/roles.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 6;
const GENERIC_RECOVERY_RESPONSE = "If the account exists, a recovery email has been sent.";
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

const buildUsernameBase = (username) => {
	return (
		username
			?.trim()
			.toLowerCase()
			.replace(/\s+/g, "")
			.replace(/[^a-zA-Z0-9_]/g, "")
			.slice(0, 20) || "user"
	);
};

const generateUsernameSuggestion = async (username) => {
	const baseUsername = buildUsernameBase(username);
	const relatedUsers = await prisma.user.findMany({
		where: {
			username: {
				startsWith: baseUsername,
				mode: "insensitive",
			},
		},
		select: {
			username: true,
		},
	});

	const takenUsernames = new Set(relatedUsers.map((user) => normalizeUsername(user.username)));
	if (!takenUsernames.has(baseUsername)) {
		return baseUsername;
	}

	let suffix = 1;
	while (takenUsernames.has(`${baseUsername}${suffix}`)) {
		suffix += 1;
	}

	return `${baseUsername}${suffix}`;
};

const normalizeEmail = (email) =>
	typeof email === "string" ? email.trim().toLowerCase() : "";

const normalizeBaseUrl = (value) => {
	if (!value) return "";

	try {
		const url = new URL(String(value).trim());
		url.pathname = "";
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/+$/, "");
	} catch {
		return "";
	}
};

const buildAppBaseUrl = (req) => {
	const configuredBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
	if (configuredBaseUrl) return configuredBaseUrl;

	const requestDerivedBaseUrl =
		normalizeBaseUrl(req.get("origin")) ||
		normalizeBaseUrl(req.get("referer")) ||
		normalizeBaseUrl(req.get("x-forwarded-origin")) ||
		normalizeBaseUrl(
			req.get("x-forwarded-proto") && req.get("x-forwarded-host")
				? `${req.get("x-forwarded-proto")}://${req.get("x-forwarded-host")}`
				: ""
		) ||
		normalizeBaseUrl(`${req.protocol}://${req.get("host")}`);

	return requestDerivedBaseUrl;
};

const validateEmail = (email) => EMAIL_PATTERN.test(email);

const buildVerificationUrl = (req, token) =>
	`${buildAppBaseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`;

const buildAuthenticatedUserDto = (user, sessionTokenId) =>
	toUserDto(
		{
			...user,
			currentSessionId: sessionTokenId,
		},
		{
			includeDeveloperPermissions: true,
			includeSensitiveFields: true,
		}
	);

const createAuthenticatedSession = async ({ user, req, res }) => {
	const session = await createUserSessionRecord({
		userId: user.id,
		req,
	});

	generateTokenAndSetCookie(user.id, session.sessionTokenId, res);

	return buildAuthenticatedUserDto(user, session.sessionTokenId);
};

const recordFailedLoginAttempt = async ({ user, req, reason = "invalid_credentials" }) => {
	if (!user?.id) {
		await createRequestSecurityEvent({
			req,
			eventType: "FAILED_LOGIN",
			riskLevel: "LOW",
			summary: "Failed login attempt for an unknown account",
			details: {
				reason,
			},
		});
		return {
			locked: false,
		};
	}

	const nextAttempts = (user.failedLoginAttempts || 0) + 1;
	const shouldLock = nextAttempts >= LOGIN_FAILURE_LIMIT;
	const lockedUntil = shouldLock ? new Date(Date.now() + LOGIN_LOCK_DURATION_MS) : null;
	const updatedUser = await prisma.user.update({
		where: { id: user.id },
		data: {
			failedLoginAttempts: nextAttempts,
			lockedUntil,
		},
	});

	await createRequestSecurityEvent({
		req,
		userId: user.id,
		eventType: "FAILED_LOGIN",
		riskLevel: shouldLock ? "HIGH" : "MEDIUM",
		summary: shouldLock ? "Account temporarily locked after repeated failed logins" : "Failed login attempt",
		details: {
			reason,
			attempts: nextAttempts,
			lockedUntil,
		},
	});

	if (shouldLock) {
		await createRequestSecurityEvent({
			req,
			userId: user.id,
			eventType: "ACCOUNT_LOCKED",
			riskLevel: "HIGH",
			summary: "Account locked after repeated failed sign-in attempts",
			details: {
				reason,
				attempts: nextAttempts,
				lockedUntil,
			},
		});
	}

	return {
		locked: Boolean(lockedUntil),
		lockedUntil,
		user: updatedUser,
	};
};

const sendEmailVerificationToUser = async ({ user, req }) => {
	if (!user?.id || !user?.email) {
		return false;
	}

	ensureEmailDeliveryIsConfigured();
	const { token, tokenHash } = createVerificationToken();
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const verificationUrl = buildVerificationUrl(req, token);
	const emailContent = buildEmailVerificationEmail({
		fullName: user.fullName,
		verificationUrl,
	});

	await prisma.user.update({
		where: { id: user.id },
		data: {
			emailVerificationTokenHash: tokenHash,
			emailVerificationTokenExpiresAt: expiresAt,
		},
	});

	await sendTransactionalEmail({
		to: user.email,
		subject: emailContent.subject,
		html: emailContent.html,
		text: emailContent.text,
	});

	return true;
};

export const checkUsernameAvailability = async (req, res) => {
	try {
		const normalizedUsername = normalizeUsername(req.query?.username);

		if (!normalizedUsername) {
			return res.status(400).json({ error: "Username is required" });
		}

		if (!USERNAME_PATTERN.test(normalizedUsername)) {
			return res.status(200).json({
				available: false,
				valid: false,
				message: "Use 3-20 chars: letters, numbers, or _",
				suggestion: "",
			});
		}

		if (!isDatabaseAvailable()) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}

		const existingUser = await prisma.user.findFirst({
			where: {
				username: buildUsernameInsensitiveLookup(normalizedUsername),
			},
			select: { id: true },
		});

		if (existingUser) {
			const suggestion = await generateUsernameSuggestion(normalizedUsername);
			return res.status(200).json({
				available: false,
				valid: true,
				message: "Username is already taken",
				suggestion,
			});
		}

		return res.status(200).json({
			available: true,
			valid: true,
			message: "Username is available",
			suggestion: "",
		});
	} catch (error) {
		console.log("Error in checkUsernameAvailability controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const signup = async (req, res) => {
	try {
		const { fullName, username, email, password, confirmPassword, gender } = req.body;
		const normalizedFullName = typeof fullName === "string" ? fullName.trim() : "";
		const normalizedUsername = normalizeUsername(username);
		const normalizedEmail = normalizeEmail(email);
		const normalizedGender = typeof gender === "string" ? gender.toLowerCase().trim() : "";

		if (!normalizedFullName || !normalizedUsername || !normalizedEmail || !password || !confirmPassword || !normalizedGender) {
			return res.status(400).json({ error: "All fields are required" });
		}

		if (!USERNAME_PATTERN.test(normalizedUsername)) {
			return res.status(400).json({
				error: "Username must be 3-20 characters and use only letters, numbers, or _",
			});
		}

		if (!validateEmail(normalizedEmail)) {
			return res.status(400).json({ error: "Please enter a valid email address" });
		}

		if (password !== confirmPassword) {
			return res.status(400).json({ error: "Passwords don't match" });
		}

		if (password.length < PASSWORD_MIN_LENGTH) {
			return res.status(400).json({ error: "Password must be at least 6 characters" });
		}

		const user = await prisma.user.findFirst({
			where: {
				username: buildUsernameInsensitiveLookup(normalizedUsername),
			},
		});

		if (user) {
			const suggestion = await generateUsernameSuggestion(normalizedUsername);
			return res.status(400).json({
				error: "Username already exists",
				suggestion,
			});
		}

		const existingEmail = await prisma.user.findUnique({
			where: { email: normalizedEmail },
			select: { id: true },
		});

		if (existingEmail) {
			return res.status(400).json({ error: "Email already exists" });
		}

		// HASH PASSWORD HERE
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		// https://avatar-placeholder.iran.liara.run/

		const boyProfilePic = `/avatars/male.svg`;
		const girlProfilePic = `/avatars/female.svg`;
		const usernameMatchesPrimary = isPrimaryDeveloperUsername(normalizedUsername);
		const existingPrimaryDeveloper = usernameMatchesPrimary
			? await prisma.user.findFirst({
					where: { isPrimaryDeveloper: true },
					select: { id: true },
			  })
			: null;
		const isPrimaryDeveloper = usernameMatchesPrimary && !existingPrimaryDeveloper;
		const role = isPrimaryDeveloper ? DEVELOPER_ROLE : getRoleForNewAccount(normalizedUsername);

		const newUser = await prisma.user.create({
			data: {
				fullName: normalizedFullName,
				username: normalizedUsername,
				email: normalizedEmail,
				password: hashedPassword,
				gender: normalizedGender,
				role,
				isPrimaryDeveloper,
				profilePic: normalizedGender === "male" ? boyProfilePic : girlProfilePic,
			},
		});

		let authenticatedUser = null;
		authenticatedUser = await createAuthenticatedSession({
			user: newUser,
			req,
			res,
		});
		emitPublicUserUpdated(newUser);

		try {
			await sendEmailVerificationToUser({ user: newUser, req });
		} catch (verificationError) {
			console.warn("Skipped signup verification email:", verificationError.message);
		}

		res.status(201).json(authenticatedUser);
	} catch (error) {
		console.log("Error in signup controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal Server Error" });
	}
};

export const login = async (req, res) => {
	try {
		const normalizedUsername = normalizeUsername(req.body?.username);
		const password = typeof req.body?.password === "string" ? req.body.password : "";
		const twoFactorCode = typeof req.body?.twoFactorCode === "string" ? req.body.twoFactorCode.trim() : "";
		let user = await prisma.user.findFirst({
			where: {
				username: buildUsernameInsensitiveLookup(normalizedUsername),
			},
		});

		if (!user) {
			await recordFailedLoginAttempt({ user: null, req, reason: "unknown_username" });
			return res.status(400).json({ error: "Invalid username or password" });
		}

		if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
			return res.status(423).json({
				error: "Too many failed attempts. Try again in a few minutes.",
				lockedUntil: user.lockedUntil,
			});
		}

		const isPasswordCorrect = await bcrypt.compare(password, user.password);

		if (!isPasswordCorrect) {
			const failedAttempt = await recordFailedLoginAttempt({
				user,
				req,
				reason: "invalid_password",
			});
			if (failedAttempt.locked) {
				return res.status(423).json({
					error: "Too many failed attempts. Try again in a few minutes.",
					lockedUntil: failedAttempt.lockedUntil,
				});
			}
			return res.status(400).json({ error: "Invalid username or password" });
		}

		if (user.twoFactorEnabled) {
			if (!twoFactorCode) {
				return res.status(202).json({
					requiresTwoFactor: true,
					message: "Enter your authentication code to finish signing in",
				});
			}

			if (!verifyTwoFactorCode(user.twoFactorSecret, twoFactorCode)) {
				const failedAttempt = await recordFailedLoginAttempt({
					user,
					req,
					reason: "invalid_two_factor_code",
				});
				if (failedAttempt.locked) {
					return res.status(423).json({
						error: "Too many failed attempts. Try again in a few minutes.",
						lockedUntil: failedAttempt.lockedUntil,
					});
				}
				return res.status(400).json({ error: "Invalid authentication code" });
			}
		}

		if (user.isArchived) {
			return res.status(403).json({
				error: "Your account has been banned",
			});
		}

		if (user.isBanned) {
			return res.status(403).json({
				error: "Your account has been banned",
			});
		}

		const existingPrimaryDeveloper = user.isPrimaryDeveloper
			? null
			: await prisma.user.findFirst({
					where: {
						isPrimaryDeveloper: true,
						id: { not: user.id },
					},
					select: { id: true },
			  });
		const shouldBePrimaryDeveloper =
			user.isPrimaryDeveloper || (isPrimaryDeveloperUsername(user.username) && !existingPrimaryDeveloper);
		const shouldBeDeveloper = user.role === DEVELOPER_ROLE || shouldBootstrapDeveloper(user.username) || shouldBePrimaryDeveloper;

		if (
			shouldBeDeveloper &&
			(user.role !== DEVELOPER_ROLE || user.isPrimaryDeveloper !== shouldBePrimaryDeveloper)
		) {
			user = await prisma.user.update({
				where: { id: user.id },
				data: {
					role: DEVELOPER_ROLE,
					isPrimaryDeveloper: shouldBePrimaryDeveloper,
				},
			});
		}

		const currentRequestIp = req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || null;
		const previousSessions = await prisma.userSession.findMany({
			where: {
				userId: user.id,
			},
			orderBy: { createdAt: "desc" },
			take: 8,
			select: {
				ipAddress: true,
			},
		});
		const knownIpAddresses = new Set(previousSessions.map((session) => session.ipAddress).filter(Boolean));

		if (user.failedLoginAttempts || user.lockedUntil) {
			user = await prisma.user.update({
				where: { id: user.id },
				data: {
					failedLoginAttempts: 0,
					lockedUntil: null,
				},
			});
		}

		const authenticatedUser = await createAuthenticatedSession({
			user,
			req,
			res,
		});

		await createRequestSecurityEvent({
			req,
			userId: user.id,
			eventType: "LOGIN_SUCCESS",
			riskLevel: "LOW",
			summary: "Successful login",
		});

		if (currentRequestIp && knownIpAddresses.size > 0 && !knownIpAddresses.has(currentRequestIp)) {
			await createRequestSecurityEvent({
				req,
				userId: user.id,
				eventType: "SUSPICIOUS_IP",
				riskLevel: "HIGH",
				summary: "New IP address used for sign in",
				details: {
					ipAddress: currentRequestIp,
					knownIpAddresses: Array.from(knownIpAddresses),
				},
			});
		}

		res.status(200).json(authenticatedUser);
	} catch (error) {
		console.log("Error in login controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal Server Error" });
	}
};

export const forgotPassword = async (req, res) => {
	try {
		ensureEmailDeliveryIsConfigured();

		const normalizedEmail = normalizeEmail(req.body?.email);
		if (!validateEmail(normalizedEmail)) {
			return res.status(400).json({ error: "Please enter a valid email address" });
		}

		const user = await prisma.user.findUnique({
			where: { email: normalizedEmail },
			select: {
				id: true,
				fullName: true,
				email: true,
				isArchived: true,
				isBanned: true,
			},
		});

		if (user && !user.isArchived && !user.isBanned) {
			const { token, tokenHash, expiresAt } = createRecoveryToken({ expiresInMinutes: 20 });
			const resetUrl = `${buildAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
			const emailContent = buildPasswordResetEmail({
				fullName: user.fullName,
				resetUrl,
			});

			await prisma.user.update({
				where: { id: user.id },
				data: {
					passwordResetTokenHash: tokenHash,
					passwordResetTokenExpiresAt: expiresAt,
				},
			});

			await sendTransactionalEmail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text,
			});
		}

		return res.status(200).json({ message: GENERIC_RECOVERY_RESPONSE });
	} catch (error) {
		console.log("Error in forgotPassword controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		if (error?.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const forgotUsername = async (req, res) => {
	try {
		ensureEmailDeliveryIsConfigured();

		const normalizedEmail = normalizeEmail(req.body?.email);
		if (!validateEmail(normalizedEmail)) {
			return res.status(400).json({ error: "Please enter a valid email address" });
		}

		const user = await prisma.user.findUnique({
			where: { email: normalizedEmail },
			select: {
				fullName: true,
				username: true,
				email: true,
				isArchived: true,
				isBanned: true,
			},
		});

		if (user && !user.isArchived && !user.isBanned) {
			const emailContent = buildUsernameReminderEmail({
				fullName: user.fullName,
				username: user.username,
				loginUrl: `${buildAppBaseUrl(req)}/login`,
			});

			await sendTransactionalEmail({
				to: user.email,
				subject: emailContent.subject,
				html: emailContent.html,
				text: emailContent.text,
			});
		}

		return res.status(200).json({ message: GENERIC_RECOVERY_RESPONSE });
	} catch (error) {
		console.log("Error in forgotUsername controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		if (error?.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const resetPassword = async (req, res) => {
	try {
		const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
		const password = typeof req.body?.password === "string" ? req.body.password : "";
		const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

		if (!token || !password || !confirmPassword) {
			return res.status(400).json({ error: "Token, password, and confirmation are required" });
		}

		if (password !== confirmPassword) {
			return res.status(400).json({ error: "Passwords don't match" });
		}

		if (password.length < PASSWORD_MIN_LENGTH) {
			return res.status(400).json({ error: "Password must be at least 6 characters" });
		}

		const tokenHash = hashRecoveryToken(token);
		const user = await prisma.user.findFirst({
			where: {
				passwordResetTokenHash: tokenHash,
				passwordResetTokenExpiresAt: {
					gt: new Date(),
				},
			},
			select: {
				id: true,
			},
		});

		if (!user) {
			return res.status(400).json({ error: "This reset link is invalid or has expired" });
		}

		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		await prisma.user.update({
			where: { id: user.id },
			data: {
				password: hashedPassword,
				passwordResetTokenHash: null,
				passwordResetTokenExpiresAt: null,
			},
		});

		await createRequestSecurityEvent({
			req,
			userId: user.id,
			eventType: "PASSWORD_RESET",
			riskLevel: "MEDIUM",
			summary: "Password reset completed",
		});

		return res.status(200).json({ message: "Password updated successfully" });
	} catch (error) {
		console.log("Error in resetPassword controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const sendEmailVerification = async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user._id },
			select: {
				id: true,
				fullName: true,
				email: true,
				emailVerifiedAt: true,
			},
		});

		if (!user?.email) {
			return res.status(400).json({ error: "Add an email address before requesting verification" });
		}

		if (user.emailVerifiedAt) {
			return res.status(200).json({ message: "Email is already verified" });
		}

		await sendEmailVerificationToUser({ user, req });
		return res.status(200).json({ message: "Verification email sent" });
	} catch (error) {
		console.log("Error in sendEmailVerification controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		if (error?.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const verifyEmail = async (req, res) => {
	try {
		const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";

		if (!token) {
			return res.status(400).json({ error: "Verification token is required" });
		}

		const tokenHash = hashRecoveryToken(token);
		const user = await prisma.user.findFirst({
			where: {
				emailVerificationTokenHash: tokenHash,
				emailVerificationTokenExpiresAt: {
					gt: new Date(),
				},
			},
			select: {
				id: true,
			},
		});

		if (!user) {
			return res.status(400).json({ error: "This verification link is invalid or has expired" });
		}

		await prisma.user.update({
			where: { id: user.id },
			data: {
				emailVerificationTokenHash: null,
				emailVerificationTokenExpiresAt: null,
				emailVerifiedAt: new Date(),
			},
		});

		await createRequestSecurityEvent({
			req,
			userId: user.id,
			eventType: "EMAIL_VERIFIED",
			riskLevel: "LOW",
			summary: "Recovery email verified",
		});

		return res.status(200).json({ message: "Email verified successfully" });
	} catch (error) {
		console.log("Error in verifyEmail controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const createTwoFactorSetupSession = async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user._id },
			select: {
				id: true,
				username: true,
				email: true,
				emailVerifiedAt: true,
				twoFactorEnabled: true,
			},
		});

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (!user.emailVerifiedAt) {
			return res.status(403).json({ error: "Verify your email before enabling 2FA" });
		}

		if (user.twoFactorEnabled) {
			return res.status(400).json({ error: "2FA is already enabled" });
		}

		const setup = await createTwoFactorSetup({
			email: user.email,
			username: user.username,
		});

		await prisma.user.update({
			where: { id: user.id },
			data: {
				twoFactorPendingSecret: setup.secret,
			},
		});

		return res.status(200).json({
			qrCodeDataUrl: setup.qrCodeDataUrl,
			secret: setup.secret,
			message: "Scan the QR code and enter the 6-digit code to finish setup",
		});
	} catch (error) {
		console.log("Error in createTwoFactorSetupSession controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const verifyTwoFactorSetup = async (req, res) => {
	try {
		const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
		const user = await prisma.user.findUnique({
			where: { id: req.user._id },
			select: {
				id: true,
				twoFactorPendingSecret: true,
			},
		});

		if (!user?.twoFactorPendingSecret) {
			return res.status(400).json({ error: "2FA setup has not been started" });
		}

		if (!verifyTwoFactorCode(user.twoFactorPendingSecret, code)) {
			return res.status(400).json({ error: "Invalid authentication code" });
		}

		await prisma.user.update({
			where: { id: user.id },
			data: {
				twoFactorEnabled: true,
				twoFactorSecret: user.twoFactorPendingSecret,
				twoFactorPendingSecret: null,
			},
		});

		await createRequestSecurityEvent({
			req,
			userId: user.id,
			eventType: "TWO_FACTOR_ENABLED",
			riskLevel: "LOW",
			summary: "Two-factor authentication enabled",
		});

		return res.status(200).json({ message: "2FA enabled successfully" });
	} catch (error) {
		console.log("Error in verifyTwoFactorSetup controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const disableTwoFactor = async (req, res) => {
	try {
		const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
		const user = await prisma.user.findUnique({
			where: { id: req.user._id },
			select: {
				id: true,
				twoFactorEnabled: true,
				twoFactorSecret: true,
			},
		});

		if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
			return res.status(200).json({ message: "2FA is already disabled" });
		}

		if (!verifyTwoFactorCode(user.twoFactorSecret, code)) {
			return res.status(400).json({ error: "Invalid authentication code" });
		}

		await prisma.user.update({
			where: { id: user.id },
			data: {
				twoFactorEnabled: false,
				twoFactorSecret: null,
				twoFactorPendingSecret: null,
			},
		});

		await createRequestSecurityEvent({
			req,
			userId: user.id,
			eventType: "TWO_FACTOR_DISABLED",
			riskLevel: "MEDIUM",
			summary: "Two-factor authentication disabled",
		});

		return res.status(200).json({ message: "2FA disabled successfully" });
	} catch (error) {
		console.log("Error in disableTwoFactor controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const getCurrentUser = (req, res) => {
	try {
		res.status(200).json(req.user);
	} catch (error) {
		console.log("Error in getCurrentUser controller", error.message);
		res.status(500).json({ error: "Internal Server Error" });
	}
};

export const getMyFeatureFlags = async (req, res) => {
	try {
		const flags = await prisma.featureFlag.findMany({
			where: {
				isEnabled: true,
			},
			orderBy: { updatedAt: "desc" },
		});

		return res.status(200).json({
			flags: flags.map((flag) =>
				mapResolvedFeatureFlag(flag, {
					id: req.user._id,
					role: req.user.role,
				})
			),
		});
	} catch (error) {
		console.log("Error in getMyFeatureFlags controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const getSessionUser = async (req, res) => {
	try {
		const token = req.cookies?.[SESSION_COOKIE_NAME];
		if (!token) {
			return res.status(200).json(null);
		}

		let decoded = null;
		try {
			decoded = jwt.verify(token, process.env.JWT_SECRET);
		} catch {
			res.cookie(SESSION_COOKIE_NAME, "", { maxAge: 0 });
			return res.status(200).json(null);
		}

		if (!decoded?.userId) {
			res.cookie(SESSION_COOKIE_NAME, "", { maxAge: 0 });
			return res.status(200).json(null);
		}

		if (!decoded?.sessionId) {
			res.cookie(SESSION_COOKIE_NAME, "", { maxAge: 0 });
			return res.status(200).json(null);
		}

		const session = await getActiveUserSessionByTokenId(decoded.sessionId);
		if (!session) {
			res.cookie(SESSION_COOKIE_NAME, "", { maxAge: 0 });
			return res.status(200).json(null);
		}

		if (!isDatabaseAvailable()) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}

		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});

		if (!user || user.isArchived || user.isBanned) {
			res.cookie(SESSION_COOKIE_NAME, "", { maxAge: 0 });
			return res.status(200).json(null);
		}

		void touchUserSession(session.sessionTokenId);

		return res.status(200).json(
			buildAuthenticatedUserDto(user, session.sessionTokenId)
		);
	} catch (error) {
		console.log("Error in getSessionUser controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal Server Error" });
	}
};

export const logout = (req, res) => {
	try {
		const token = req.cookies?.[SESSION_COOKIE_NAME];
		if (token) {
			try {
				const decoded = jwt.verify(token, process.env.JWT_SECRET);
				void revokeUserSession(decoded?.sessionId);
			} catch {
				// Ignore invalid tokens while clearing the cookie.
			}
		}

		res.cookie(SESSION_COOKIE_NAME, "", { maxAge: 0 });
		res.status(200).json({ message: "Logged out successfully" });
	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ error: "Internal Server Error" });
	}
};
