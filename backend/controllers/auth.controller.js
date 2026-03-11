import bcrypt from "bcryptjs";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import generateTokenAndSetCookie from "../utils/generateToken.js";
import { toUserDto } from "../utils/formatters.js";
import { emitPublicUserUpdated } from "../utils/realtime.js";
import {
	DEVELOPER_ROLE,
	getRoleForNewAccount,
	isPrimaryDeveloperUsername,
	shouldBootstrapDeveloper,
} from "../utils/roles.js";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

const buildUsernameBase = (username) => {
	return (
		username
			?.trim()
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
			},
		},
		select: {
			username: true,
		},
	});

	const takenUsernames = new Set(relatedUsers.map((user) => user.username));
	if (!takenUsernames.has(baseUsername)) {
		return baseUsername;
	}

	let suffix = 1;
	while (takenUsernames.has(`${baseUsername}${suffix}`)) {
		suffix += 1;
	}

	return `${baseUsername}${suffix}`;
};

export const signup = async (req, res) => {
	try {
		const { fullName, username, password, confirmPassword, gender } = req.body;
		const normalizedFullName = typeof fullName === "string" ? fullName.trim() : "";
		const normalizedUsername = typeof username === "string" ? username.trim() : "";
		const normalizedGender = typeof gender === "string" ? gender.toLowerCase().trim() : "";

		if (!normalizedFullName || !normalizedUsername || !password || !confirmPassword || !normalizedGender) {
			return res.status(400).json({ error: "All fields are required" });
		}

		if (!USERNAME_PATTERN.test(normalizedUsername)) {
			return res.status(400).json({
				error: "Username must be 3-20 characters and use only letters, numbers, or _",
			});
		}

		if (password !== confirmPassword) {
			return res.status(400).json({ error: "Passwords don't match" });
		}

		const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });

		if (user) {
			const suggestion = await generateUsernameSuggestion(normalizedUsername);
			return res.status(400).json({
				error: "Username already exists",
				suggestion,
			});
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
				password: hashedPassword,
				gender: normalizedGender,
				role,
				isPrimaryDeveloper,
				profilePic: normalizedGender === "male" ? boyProfilePic : girlProfilePic,
			},
		});

		// Generate JWT token here
		generateTokenAndSetCookie(newUser.id, res);
		emitPublicUserUpdated(newUser);

		res.status(201).json(toUserDto(newUser, { includeDeveloperPermissions: true }));
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
		const { username, password } = req.body;
		let user = await prisma.user.findUnique({ where: { username } });

		if (!user) {
			return res.status(400).json({ error: "Invalid username or password" });
		}

		const isPasswordCorrect = await bcrypt.compare(password, user.password);

		if (!isPasswordCorrect) {
			return res.status(400).json({ error: "Invalid username or password" });
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

		generateTokenAndSetCookie(user.id, res);

		res.status(200).json(toUserDto(user, { includeDeveloperPermissions: true }));
	} catch (error) {
		console.log("Error in login controller", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal Server Error" });
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

export const logout = (req, res) => {
	try {
		res.cookie("jwt", "", { maxAge: 0 });
		res.status(200).json({ message: "Logged out successfully" });
	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ error: "Internal Server Error" });
	}
};
