import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { disconnectUserSockets } from "../socket/socket.js";
import { deleteMessageEverywhere } from "../utils/messageModeration.js";
import { toUserDto } from "../utils/formatters.js";
import { DEVELOPER_ROLE, USER_ROLE } from "../utils/roles.js";

const VALID_ROLES = new Set([USER_ROLE, DEVELOPER_ROLE]);
const developerUserSelect = {
	id: true,
	fullName: true,
	username: true,
	role: true,
	isPrimaryDeveloper: true,
	isArchived: true,
	archivedAt: true,
	isBanned: true,
	bannedAt: true,
	bannedReason: true,
	isVerified: true,
	verifiedAt: true,
	profilePic: true,
	gender: true,
	bio: true,
	lastSeen: true,
	createdAt: true,
	updatedAt: true,
};

const handleDeveloperError = (error, res, contextLabel) => {
	console.error(`Error in ${contextLabel}:`, error.message);
	if (isPrismaConnectionError(error)) {
		return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
	}
	return res.status(500).json({ error: "Internal server error" });
};

const ensureAnotherDeveloperExists = async (userId) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { role: true, isArchived: true, isBanned: true },
	});

	if (!user || user.role !== DEVELOPER_ROLE || user.isArchived || user.isBanned) {
		return user;
	}

	const developerCount = await prisma.user.count({
		where: { role: DEVELOPER_ROLE, isArchived: false, isBanned: false },
	});

	if (developerCount <= 1) {
		const error = new Error("You must keep at least one developer account.");
		error.statusCode = 400;
		throw error;
	}

	return user;
};

const normalizeBanReason = (reason) => {
	if (typeof reason !== "string") {
		return null;
	}

	const trimmedReason = reason.trim();
	return trimmedReason ? trimmedReason.slice(0, 250) : null;
};

const ensurePrimaryDeveloperProtection = (actor, targetUser) => {
	if (targetUser?.isPrimaryDeveloper && !actor?.isPrimaryDeveloper) {
		const error = new Error("This primary developer account is protected.");
		error.statusCode = 403;
		throw error;
	}
};

const setDeveloperUserArchiveState = async (actor, userId, shouldArchive) => {
	if (userId === actor._id) {
		const error = new Error("You cannot archive your own account from the developer console.");
		error.statusCode = 400;
		throw error;
	}

	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
		select: developerUserSelect,
	});

	if (!existingUser) {
		const error = new Error("User not found");
		error.statusCode = 404;
		throw error;
	}

	ensurePrimaryDeveloperProtection(actor, existingUser);

	if (shouldArchive && existingUser.role === DEVELOPER_ROLE) {
		await ensureAnotherDeveloperExists(existingUser.id);
	}

	if (existingUser.isArchived === shouldArchive) {
		return {
			message: shouldArchive ? "User is already archived" : "User is already restored",
			user: toUserDto(existingUser),
		};
	}

	const updatedUser = await prisma.user.update({
		where: { id: userId },
		data: shouldArchive
			? {
					isArchived: true,
					archivedAt: new Date(),
			  }
			: {
					isArchived: false,
					archivedAt: null,
			  },
	});

	if (shouldArchive) {
		disconnectUserSockets(userId, "archived");
	}

	return {
		message: shouldArchive ? "User moved to archive" : "User restored from archive",
		user: toUserDto(updatedUser),
	};
};

const mapDeveloperUser = (user) => ({
	...toUserDto(user),
	conversationCount: (user._count?.conversationsAsUserOne || 0) + (user._count?.conversationsAsUserTwo || 0),
	sentMessageCount: user._count?.sentMessages || 0,
});

export const getDeveloperOverview = async (req, res) => {
	try {
		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

		const [totalUsers, developerCount, archivedCount, bannedCount, conversationCount, messageCount, newUsersThisWeek, latestUsers] =
			await Promise.all([
				prisma.user.count(),
				prisma.user.count({ where: { role: DEVELOPER_ROLE, isArchived: false, isBanned: false } }),
				prisma.user.count({ where: { isArchived: true } }),
				prisma.user.count({ where: { isBanned: true } }),
				prisma.conversation.count(),
				prisma.message.count(),
				prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
				prisma.user.findMany({
					take: 5,
					orderBy: { createdAt: "desc" },
					select: developerUserSelect,
				}),
			]);

		res.status(200).json({
			totals: {
				totalUsers,
				developerCount,
				archivedCount,
				bannedCount,
				conversationCount,
				messageCount,
				newUsersThisWeek,
			},
			latestUsers: latestUsers.map((user) => toUserDto(user)),
		});
	} catch (error) {
		return handleDeveloperError(error, res, "getDeveloperOverview");
	}
};

export const getDeveloperUsers = async (req, res) => {
	try {
		const users = await prisma.user.findMany({
			orderBy: [{ isPrimaryDeveloper: "desc" }, { isArchived: "asc" }, { createdAt: "desc" }],
			select: {
				...developerUserSelect,
				_count: {
					select: {
						sentMessages: true,
						conversationsAsUserOne: true,
						conversationsAsUserTwo: true,
					},
				},
			},
		});

		res.status(200).json(users.map((user) => mapDeveloperUser(user)));
	} catch (error) {
		return handleDeveloperError(error, res, "getDeveloperUsers");
	}
};

export const getDeveloperMessages = async (req, res) => {
	try {
		const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
		const messages = await prisma.message.findMany({
			take: limit,
			orderBy: { createdAt: "desc" },
			include: {
				sender: {
					select: {
						id: true,
						fullName: true,
						username: true,
						role: true,
					},
				},
				receiver: {
					select: {
						id: true,
						fullName: true,
						username: true,
						role: true,
					},
				},
			},
		});

		res.status(200).json(
			messages.map((message) => ({
				_id: message.id,
				conversationId: message.conversationId,
				message: message.message,
				audio: message.audio,
				isSeen: message.isSeen,
				createdAt: message.createdAt,
				sender: message.sender
					? {
							_id: message.sender.id,
							fullName: message.sender.fullName,
							username: message.sender.username,
							role: message.sender.role,
					  }
					: null,
				receiver: message.receiver
					? {
							_id: message.receiver.id,
							fullName: message.receiver.fullName,
							username: message.receiver.username,
							role: message.receiver.role,
					  }
					: null,
			}))
		);
	} catch (error) {
		return handleDeveloperError(error, res, "getDeveloperMessages");
	}
};

export const updateDeveloperUserRole = async (req, res) => {
	try {
		const { id } = req.params;
		const { role } = req.body;

		if (!VALID_ROLES.has(role)) {
			return res.status(400).json({ error: "Invalid role" });
		}

		if (id === req.user._id) {
			return res.status(400).json({ error: "You cannot change your own role from the developer console." });
		}

		const existingUser = await prisma.user.findUnique({
			where: { id },
			select: developerUserSelect,
		});

		if (!existingUser) {
			return res.status(404).json({ error: "User not found" });
		}

		ensurePrimaryDeveloperProtection(req.user, existingUser);

		if (existingUser.role === role) {
			return res.status(200).json({ message: "Role already set", user: toUserDto(existingUser) });
		}

		if (existingUser.role === DEVELOPER_ROLE && role !== DEVELOPER_ROLE) {
			await ensureAnotherDeveloperExists(existingUser.id);
		}

		const updatedUser = await prisma.user.update({
			where: { id },
			data: { role },
		});

		return res.status(200).json({
			message: role === DEVELOPER_ROLE ? "User promoted to developer" : "User switched to regular access",
			user: toUserDto(updatedUser),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "updateDeveloperUserRole");
	}
};

export const updateDeveloperUserBan = async (req, res) => {
	try {
		const { id } = req.params;
		const { isBanned } = req.body ?? {};
		const bannedReason = normalizeBanReason(req.body?.reason);

		if (typeof isBanned !== "boolean") {
			return res.status(400).json({ error: "Invalid ban status" });
		}

		const shouldBan = isBanned;

		if (id === req.user._id) {
			return res.status(400).json({ error: "You cannot change your own ban status from the developer console." });
		}

		const existingUser = await prisma.user.findUnique({
			where: { id },
			select: developerUserSelect,
		});

		if (!existingUser) {
			return res.status(404).json({ error: "User not found" });
		}

		ensurePrimaryDeveloperProtection(req.user, existingUser);

		if (shouldBan && existingUser.role === DEVELOPER_ROLE) {
			await ensureAnotherDeveloperExists(existingUser.id);
		}

		if (existingUser.isBanned === shouldBan) {
			return res.status(200).json({
				message: shouldBan ? "User is already banned" : "User is already active",
				user: toUserDto(existingUser),
			});
		}

		const updatedUser = await prisma.user.update({
			where: { id },
			data: shouldBan
				? {
						isBanned: true,
						bannedAt: new Date(),
						bannedReason,
				  }
				: {
						isBanned: false,
						bannedAt: null,
						bannedReason: null,
				  },
		});

		if (shouldBan) {
			disconnectUserSockets(id, "banned");
		}

		return res.status(200).json({
			message: shouldBan ? "User banned successfully" : "User ban removed successfully",
			user: toUserDto(updatedUser),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "updateDeveloperUserBan");
	}
};

export const updateDeveloperUserVerification = async (req, res) => {
	try {
		const { id } = req.params;
		const { isVerified } = req.body ?? {};

		if (typeof isVerified !== "boolean") {
			return res.status(400).json({ error: "Invalid verification status" });
		}

		const existingUser = await prisma.user.findUnique({
			where: { id },
			select: developerUserSelect,
		});

		if (!existingUser) {
			return res.status(404).json({ error: "User not found" });
		}

		ensurePrimaryDeveloperProtection(req.user, existingUser);

		if (existingUser.isVerified === isVerified) {
			return res.status(200).json({
				message: isVerified ? "User is already verified" : "User verification already removed",
				user: toUserDto(existingUser),
			});
		}

		const updatedUser = await prisma.user.update({
			where: { id },
			data: isVerified
				? {
						isVerified: true,
						verifiedAt: new Date(),
				  }
				: {
						isVerified: false,
						verifiedAt: null,
				  },
		});

		return res.status(200).json({
			message: isVerified ? "User verified successfully" : "Verification removed successfully",
			user: toUserDto(updatedUser),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "updateDeveloperUserVerification");
	}
};

export const updateDeveloperUserArchive = async (req, res) => {
	try {
		const { isArchived } = req.body ?? {};

		if (typeof isArchived !== "boolean") {
			return res.status(400).json({ error: "Invalid archive status" });
		}

		const result = await setDeveloperUserArchiveState(req.user, req.params.id, isArchived);
		return res.status(200).json(result);
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "updateDeveloperUserArchive");
	}
};

export const deleteDeveloperUser = async (req, res) => {
	try {
		const result = await setDeveloperUserArchiveState(req.user, req.params.id, true);
		return res.status(200).json(result);
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "deleteDeveloperUser");
	}
};

export const deleteDeveloperMessage = async (req, res) => {
	try {
		const { id } = req.params;

		const message = await prisma.message.findUnique({
			where: { id },
		});

		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		await deleteMessageEverywhere(message);

		return res.status(200).json({ message: "Message deleted by developer moderation" });
	} catch (error) {
		return handleDeveloperError(error, res, "deleteDeveloperMessage");
	}
};
