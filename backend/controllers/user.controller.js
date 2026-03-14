import bcrypt from "bcryptjs";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { toUserDto } from "../utils/formatters.js";
import { DEVELOPER_ROLE } from "../utils/roles.js";
import { CONVERSATION_TYPES, DIRECT_CONVERSATION_STATUSES } from "../utils/conversations.js";
import { buildUsernameInsensitiveLookup, normalizeUsername, USERNAME_PATTERN } from "../utils/usernames.js";
import { SESSION_COOKIE_NAME } from "../utils/authSecurity.js";
import { getBlockStatus, upsertConversationPreference } from "../utils/chatRelationships.js";
import { createRequestSecurityEvent } from "../utils/securityEvents.js";
import {
	listActiveUserSessions,
	revokeOtherUserSessions,
	revokeUserSession,
} from "../utils/userSessions.js";
import {
	emitConversationsRefreshRequired,
	emitPublicUserUpdated,
	emitSessionUserUpdated,
} from "../utils/realtime.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIVACY_FIELDS = ["showOnlineStatus", "showLastSeen", "showReadReceipts", "showTypingStatus"];

const userSelect = {
	id: true,
	fullName: true,
	username: true,
	email: true,
	isArchived: true,
	archivedAt: true,
	isBanned: true,
	bannedAt: true,
	bannedReason: true,
	role: true,
	isPrimaryDeveloper: true,
	isVerified: true,
	verifiedAt: true,
	emailVerifiedAt: true,
	twoFactorEnabled: true,
	showOnlineStatus: true,
	showLastSeen: true,
	showReadReceipts: true,
	showTypingStatus: true,
	profilePic: true,
	gender: true,
	bio: true,
	lastSeen: true,
	createdAt: true,
	updatedAt: true,
};

const toSessionDto = (session, currentSessionId = null) => ({
	id: session.id,
	sessionTokenId: session.sessionTokenId,
	userAgent: session.userAgent || "",
	ipAddress: session.ipAddress || "",
	lastSeenAt: session.lastSeenAt,
	createdAt: session.createdAt,
	updatedAt: session.updatedAt,
	isCurrent: Boolean(currentSessionId && session.sessionTokenId === currentSessionId),
});

const getDirectConversationIdForUsers = async (userId, otherUserId) => {
	if (!userId || !otherUserId) return null;

	const conversation = await prisma.conversation.findFirst({
		where: {
			type: CONVERSATION_TYPES.DIRECT,
			directStatus: DIRECT_CONVERSATION_STATUSES.ACCEPTED,
			OR: [
				{ userOneId: userId, userTwoId: otherUserId },
				{ userOneId: otherUserId, userTwoId: userId },
			],
		},
		select: { id: true },
	});

	return conversation?.id || null;
};

export const getSelectableUsers = async (req, res) => {
	try {
		const loggedInUserId = req.user._id;
		const scope = typeof req.query?.scope === "string" ? req.query.scope.trim().toLowerCase() : "all";

		let users = [];
		if (scope === "contacts") {
			const directConversations = await prisma.conversation.findMany({
				where: {
					type: CONVERSATION_TYPES.DIRECT,
					directStatus: DIRECT_CONVERSATION_STATUSES.ACCEPTED,
					OR: [{ userOneId: loggedInUserId }, { userTwoId: loggedInUserId }],
				},
				select: {
					userOneId: true,
					userTwoId: true,
					userOne: { select: userSelect },
					userTwo: { select: userSelect },
				},
			});

			const contactMap = new Map();
			for (const conversation of directConversations) {
				const counterpart =
					conversation.userOneId === loggedInUserId ? conversation.userTwo : conversation.userOne;
				if (!counterpart) continue;
				if (counterpart.id === loggedInUserId) continue;
				if (counterpart.isArchived || counterpart.isBanned) continue;
				if (!contactMap.has(counterpart.id)) {
					contactMap.set(counterpart.id, counterpart);
				}
			}

			users = Array.from(contactMap.values()).sort((userA, userB) => {
				const nameCompare = (userA.fullName || "").localeCompare(userB.fullName || "");
				if (nameCompare !== 0) return nameCompare;
				return (userA.username || "").localeCompare(userB.username || "");
			});
		} else {
			users = await prisma.user.findMany({
				where: {
					id: { not: loggedInUserId },
					isArchived: false,
					isBanned: false,
				},
				select: userSelect,
				orderBy: [{ fullName: "asc" }, { username: "asc" }],
			});
		}

		res.status(200).json(users.map((user) => toUserDto(user)));
	} catch (error) {
		console.error("Error in getSelectableUsers:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const updateProfile = async (req, res) => {
	try {
		const userId = req.user._id;
		const { fullName, username, email, gender, bio, currentPassword, newPassword, confirmPassword } = req.body;

		const data = {};
		if (typeof fullName === "string" && fullName.trim()) {
			data.fullName = fullName.trim();
		}
		const nextUsername = normalizeUsername(username);
		if (typeof username === "string" && nextUsername !== normalizeUsername(req.user.username)) {
			if (req.user.role !== DEVELOPER_ROLE) {
				return res.status(403).json({ error: "Only developers can change username" });
			}
			if (!nextUsername) {
				return res.status(400).json({ error: "Username is required" });
			}

			if (!USERNAME_PATTERN.test(nextUsername)) {
				return res.status(400).json({
					error: "Username must be 3-20 characters and use only letters, numbers, or _",
				});
			}

			const existingUsername = await prisma.user.findFirst({
				where: {
					username: buildUsernameInsensitiveLookup(nextUsername),
				},
				select: { id: true },
			});

			if (existingUsername && existingUsername.id !== userId) {
				return res.status(400).json({ error: "Username already exists" });
			}

			data.username = nextUsername;
		}
		if (typeof email === "string") {
			const nextEmail = email.trim().toLowerCase();
			if (!nextEmail) {
				return res.status(400).json({ error: "Email is required" });
			}
			if (!EMAIL_PATTERN.test(nextEmail)) {
				return res.status(400).json({ error: "Please enter a valid email address" });
			}
			if (nextEmail !== (req.user.email || "")) {
				const existingEmail = await prisma.user.findUnique({
					where: { email: nextEmail },
					select: { id: true },
				});

				if (existingEmail && existingEmail.id !== userId) {
					return res.status(400).json({ error: "Email already exists" });
				}

				data.email = nextEmail;
				data.emailVerifiedAt = null;
				data.emailVerificationTokenHash = null;
				data.emailVerificationTokenExpiresAt = null;
			}
		}
		if (typeof gender === "string" && ["male", "female"].includes(gender)) {
			data.gender = gender;
		}
		if (typeof bio === "string") {
			data.bio = bio.trim();
		}
		if (req.file?.path) {
			data.profilePic = req.file.path;
		}

		const wantsPasswordChange = currentPassword || newPassword || confirmPassword;
		if (wantsPasswordChange) {
			if (!currentPassword || !newPassword || !confirmPassword) {
				return res.status(400).json({ error: "Please fill all password fields" });
			}
			if (newPassword !== confirmPassword) {
				return res.status(400).json({ error: "Passwords don't match" });
			}
			if (newPassword.length < 6) {
				return res.status(400).json({ error: "Password must be at least 6 characters" });
			}

			const existingUser = await prisma.user.findUnique({
				where: { id: userId },
				select: { password: true },
			});
			if (!existingUser) {
				return res.status(404).json({ error: "User not found" });
			}

			const isPasswordCorrect = await bcrypt.compare(currentPassword, existingUser.password);
			if (!isPasswordCorrect) {
				return res.status(400).json({ error: "Current password is incorrect" });
			}

			const salt = await bcrypt.genSalt(10);
			data.password = await bcrypt.hash(newPassword, salt);
		}

		if (Object.keys(data).length === 0) {
			const currentUser = await prisma.user.findUnique({
				where: { id: userId },
				select: userSelect,
			});
			return res.status(200).json(toUserDto(currentUser, { includeSensitiveFields: true }));
		}

		const updatedUser = await prisma.user.update({
			where: { id: userId },
			data,
			select: userSelect,
		});

		emitSessionUserUpdated(updatedUser);
		emitPublicUserUpdated(updatedUser);

		res.status(200).json(toUserDto(updatedUser, { includeSensitiveFields: true }));
	} catch (error) {
		console.error("Error in updateProfile:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const updatePrivacySettings = async (req, res) => {
	try {
		const userId = req.user._id;
		const data = {};

		for (const field of PRIVACY_FIELDS) {
			if (typeof req.body?.[field] === "boolean") {
				data[field] = req.body[field];
			}
		}

		if (Object.keys(data).length === 0) {
			return res.status(400).json({ error: "No privacy setting changes were provided" });
		}

		const updatedUser = await prisma.user.update({
			where: { id: userId },
			data,
			select: userSelect,
		});

		emitSessionUserUpdated(updatedUser);
		emitPublicUserUpdated(updatedUser);

		return res.status(200).json(toUserDto(updatedUser, { includeSensitiveFields: true }));
	} catch (error) {
		console.error("Error in updatePrivacySettings:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getUserSessions = async (req, res) => {
	try {
		const sessions = await listActiveUserSessions(req.user._id);

		return res.status(200).json({
			sessions: sessions.map((session) => toSessionDto(session, req.user.currentSessionId)),
		});
	} catch (error) {
		console.error("Error in getUserSessions:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const revokeSessionByTokenId = async (req, res) => {
	try {
		const sessionTokenId =
			typeof req.params?.sessionTokenId === "string" ? req.params.sessionTokenId.trim() : "";

		if (!sessionTokenId) {
			return res.status(400).json({ error: "Session token id is required" });
		}

		const matchingSession = await prisma.userSession.findFirst({
			where: {
				userId: req.user._id,
				sessionTokenId,
				revokedAt: null,
			},
			select: {
				sessionTokenId: true,
			},
		});

		if (!matchingSession) {
			return res.status(404).json({ error: "Session not found" });
		}

		await revokeUserSession(sessionTokenId);

		await createRequestSecurityEvent({
			req,
			userId: req.user._id,
			eventType: "SESSION_REVOKED",
			riskLevel: "LOW",
			summary:
				sessionTokenId === req.user.currentSessionId
					? "Current session signed out"
					: "A device session was revoked",
			details: {
				sessionTokenId,
				isCurrent: sessionTokenId === req.user.currentSessionId,
			},
		});

		if (sessionTokenId === req.user.currentSessionId) {
			res.clearCookie(SESSION_COOKIE_NAME);
		}

		return res.status(200).json({
			message:
				sessionTokenId === req.user.currentSessionId
					? "Current session signed out"
					: "Session signed out",
			loggedOut: sessionTokenId === req.user.currentSessionId,
		});
	} catch (error) {
		console.error("Error in revokeSessionByTokenId:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const revokeOtherSessions = async (req, res) => {
	try {
		await revokeOtherUserSessions(req.user._id, req.user.currentSessionId || null);
		await createRequestSecurityEvent({
			req,
			userId: req.user._id,
			eventType: "SESSION_REVOKED",
			riskLevel: "LOW",
			summary: "Other device sessions were revoked",
			details: {
				exceptSessionTokenId: req.user.currentSessionId || null,
			},
		});
		return res.status(200).json({ message: "Other sessions signed out" });
	} catch (error) {
		console.error("Error in revokeOtherSessions:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getBlockedUsers = async (req, res) => {
	try {
		const blockedEntries = await prisma.userBlock.findMany({
			where: {
				blockerId: req.user._id,
			},
			orderBy: {
				createdAt: "desc",
			},
			select: {
				createdAt: true,
				blockedUser: {
					select: userSelect,
				},
			},
		});

		return res.status(200).json({
			blockedUsers: blockedEntries
				.filter((entry) => entry.blockedUser)
				.map((entry) => ({
					...toUserDto(entry.blockedUser),
					blockedAt: entry.createdAt,
				})),
		});
	} catch (error) {
		console.error("Error in getBlockedUsers:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const blockUser = async (req, res) => {
	try {
		const blockerId = req.user._id;
		const blockedUserId =
			typeof req.params?.userId === "string" ? req.params.userId.trim() : "";

		if (!blockedUserId) {
			return res.status(400).json({ error: "User id is required" });
		}

		if (blockedUserId === blockerId) {
			return res.status(400).json({ error: "You cannot block yourself" });
		}

		const targetUser = await prisma.user.findUnique({
			where: { id: blockedUserId },
			select: userSelect,
		});

		if (!targetUser || targetUser.isArchived || targetUser.isBanned) {
			return res.status(404).json({ error: "User not found" });
		}

		const existingBlockStatus = await getBlockStatus(blockerId, blockedUserId);
		if (existingBlockStatus.blockedByCurrentUser) {
			return res.status(200).json({
				message: "User already blocked",
				user: toUserDto(targetUser),
			});
		}

		await prisma.userBlock.create({
			data: {
				blockerId,
				blockedUserId,
			},
		});

		const directConversationId = await getDirectConversationIdForUsers(blockerId, blockedUserId);
		if (directConversationId) {
			await upsertConversationPreference({
				conversationId: directConversationId,
				userId: blockerId,
				data: {
					isArchived: true,
					archivedAt: new Date(),
				},
			});

			emitConversationsRefreshRequired([blockerId, blockedUserId], {
				conversationId: directConversationId,
				reason: "user-blocked",
			});
		}

		return res.status(200).json({
			message: "User blocked",
			user: toUserDto(targetUser),
			directConversationId,
		});
	} catch (error) {
		console.error("Error in blockUser:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const unblockUser = async (req, res) => {
	try {
		const blockerId = req.user._id;
		const blockedUserId =
			typeof req.params?.userId === "string" ? req.params.userId.trim() : "";

		if (!blockedUserId) {
			return res.status(400).json({ error: "User id is required" });
		}

		const existingBlockStatus = await getBlockStatus(blockerId, blockedUserId);
		if (!existingBlockStatus.blockedByCurrentUser) {
			return res.status(404).json({ error: "Block entry not found" });
		}

		await prisma.userBlock.delete({
			where: {
				blockerId_blockedUserId: {
					blockerId,
					blockedUserId,
				},
			},
		});

		const directConversationId = await getDirectConversationIdForUsers(blockerId, blockedUserId);
		if (directConversationId) {
			emitConversationsRefreshRequired([blockerId, blockedUserId], {
				conversationId: directConversationId,
				reason: "user-unblocked",
			});
		}

		return res.status(200).json({
			message: "User unblocked",
			directConversationId,
		});
	} catch (error) {
		console.error("Error in unblockUser:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};
