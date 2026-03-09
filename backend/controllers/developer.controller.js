import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { disconnectUserSockets, getUserSocketIds, io } from "../socket/socket.js";
import { createAuditLog } from "../utils/auditLogs.js";
import {
	DEFAULT_DEVELOPER_PERMISSIONS,
	ensureDeveloperPermission,
	ensurePrimaryDeveloper,
	normalizeDeveloperPermissions,
} from "../utils/developerPermissions.js";
import {
	emitConversationsRefreshRequired,
	emitDeveloperWorkspaceRefresh,
	emitPublicUserUpdated,
	emitSessionUserUpdated,
} from "../utils/realtime.js";
import { toConversationMemberDto, toMessageDto, toUserDto } from "../utils/formatters.js";
import { CONVERSATION_MEMBER_ROLES, CONVERSATION_TYPES } from "../utils/conversations.js";
import { deleteMessageEverywhere } from "../utils/messageModeration.js";
import { DEVELOPER_ROLE, USER_ROLE } from "../utils/roles.js";

const VALID_ROLES = new Set([USER_ROLE, DEVELOPER_ROLE]);
const DEVELOPER_GROUP_MESSAGE_LIMIT = 80;
const GROUP_ROLE_ORDER = {
	[CONVERSATION_MEMBER_ROLES.OWNER]: 0,
	[CONVERSATION_MEMBER_ROLES.ADMIN]: 1,
	[CONVERSATION_MEMBER_ROLES.MEMBER]: 2,
};
const developerUserSelect = {
	id: true,
	fullName: true,
	username: true,
	role: true,
	isPrimaryDeveloper: true,
	developerPermissions: true,
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
const developerGroupMessageInclude = {
	sender: {
		select: developerUserSelect,
	},
	conversation: {
		select: {
			type: true,
		},
	},
	repliedMessage: {
		include: {
			sender: {
				select: developerUserSelect,
			},
			conversation: {
				select: {
					type: true,
				},
			},
		},
	},
};
const developerGroupMemberInclude = {
	include: {
		user: {
			select: developerUserSelect,
		},
	},
	orderBy: { joinedAt: "asc" },
};
const developerGroupSummaryInclude = {
	createdBy: {
		select: developerUserSelect,
	},
	members: developerGroupMemberInclude,
	messages: {
		orderBy: { createdAt: "desc" },
		take: 1,
		include: developerGroupMessageInclude,
	},
	_count: {
		select: {
			members: true,
			messages: true,
		},
	},
};
const developerGroupDetailsInclude = {
	createdBy: {
		select: developerUserSelect,
	},
	members: developerGroupMemberInclude,
	messages: {
		orderBy: { createdAt: "desc" },
		take: DEVELOPER_GROUP_MESSAGE_LIMIT,
		include: developerGroupMessageInclude,
	},
	_count: {
		select: {
			members: true,
			messages: true,
		},
	},
};

const handleDeveloperError = (error, res, contextLabel) => {
	console.error(`Error in ${contextLabel}:`, error.message);
	if (isPrismaConnectionError(error)) {
		return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
	}
	return res.status(500).json({ error: "Internal server error" });
};

const logDeveloperAudit = async (actor, entry) => {
	try {
		await createAuditLog({
			actorId: actor?._id || null,
			...entry,
		});
	} catch (error) {
		console.error("Error logging developer audit:", error.message);
	}
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
			user: toUserDto(existingUser, { includeDeveloperPermissions: true }),
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
		user: toUserDto(updatedUser, { includeDeveloperPermissions: true }),
	};
};

const mapDeveloperUser = (user) => ({
	...toUserDto(user, { includeDeveloperPermissions: true }),
	conversationCount: (user._count?.conversationsAsUserOne || 0) + (user._count?.conversationsAsUserTwo || 0),
	sentMessageCount: user._count?.sentMessages || 0,
});

const sortDeveloperConversationMembers = (memberA, memberB) => {
	const rankA = GROUP_ROLE_ORDER[memberA?.role] ?? Number.MAX_SAFE_INTEGER;
	const rankB = GROUP_ROLE_ORDER[memberB?.role] ?? Number.MAX_SAFE_INTEGER;
	if (rankA !== rankB) {
		return rankA - rankB;
	}

	const joinedAtA = memberA?.joinedAt ? new Date(memberA.joinedAt).getTime() : 0;
	const joinedAtB = memberB?.joinedAt ? new Date(memberB.joinedAt).getTime() : 0;
	return joinedAtA - joinedAtB;
};

const emitDeveloperConversationRemoved = (conversationId, userIds) => {
	[...new Set(userIds.filter(Boolean))].forEach((userId) => {
		getUserSocketIds(userId).forEach((socketId) => {
			io.to(socketId).emit("conversationRemoved", { conversationId });
		});
	});
};

const emitDeveloperPublicGroupsChanged = () => {
	io.emit("publicGroupsChanged");
};

const mapDeveloperGroup = (conversation, { includeMessages = false } = {}) => {
	const sortedMembers = [...(conversation.members || [])].sort(sortDeveloperConversationMembers);
	const members = sortedMembers.map(toConversationMemberDto).filter(Boolean);
	const messages = (conversation.messages || []).map(toMessageDto);
	const latestMessage = messages[0] ?? null;
	const owner = members.find((member) => member.memberRole === CONVERSATION_MEMBER_ROLES.OWNER) ?? null;

	return {
		_id: conversation.id,
		type: CONVERSATION_TYPES.GROUP,
		title: conversation.title || "Untitled group",
		description: conversation.description ?? "",
		profilePic: conversation.profilePic || "",
		isPrivate: conversation.isPrivate ?? false,
		memberLimit: conversation.memberLimit ?? null,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
		createdById: conversation.createdById ?? null,
		createdBy: conversation.createdBy ? toUserDto(conversation.createdBy) : null,
		memberCount: conversation._count?.members ?? members.length,
		messageCount: conversation._count?.messages ?? 0,
		owner,
		members,
		latestMessage,
		latestActivityAt: latestMessage?.createdAt ?? conversation.updatedAt,
		messages: includeMessages ? messages : undefined,
		messageWindowSize: includeMessages ? DEVELOPER_GROUP_MESSAGE_LIMIT : undefined,
	};
};

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

export const getDeveloperGroups = async (req, res) => {
	try {
		const groups = await prisma.conversation.findMany({
			where: {
				type: CONVERSATION_TYPES.GROUP,
			},
			include: developerGroupSummaryInclude,
		});

		const mappedGroups = groups
			.map((group) => mapDeveloperGroup(group))
			.sort((groupA, groupB) => new Date(groupB.latestActivityAt || 0).getTime() - new Date(groupA.latestActivityAt || 0).getTime());

		return res.status(200).json(mappedGroups);
	} catch (error) {
		return handleDeveloperError(error, res, "getDeveloperGroups");
	}
};

export const getDeveloperGroupDetails = async (req, res) => {
	try {
		const { id } = req.params;
		const group = await prisma.conversation.findFirst({
			where: {
				id,
				type: CONVERSATION_TYPES.GROUP,
			},
			include: developerGroupDetailsInclude,
		});

		if (!group) {
			return res.status(404).json({ error: "Group not found" });
		}

		return res.status(200).json(mapDeveloperGroup(group, { includeMessages: true }));
	} catch (error) {
		return handleDeveloperError(error, res, "getDeveloperGroupDetails");
	}
};

export const deleteDeveloperGroupMessage = async (req, res) => {
	try {
		ensureDeveloperPermission(
			req.user,
			"deleteMessages",
			"Only the primary developer or a delegated developer can delete group messages"
		);
		const { id: conversationId, messageId } = req.params;
		const message = await prisma.message.findFirst({
			where: {
				id: messageId,
				conversationId,
				conversation: {
					type: CONVERSATION_TYPES.GROUP,
				},
			},
			select: {
				id: true,
				conversationId: true,
				message: true,
				audio: true,
				attachmentUrl: true,
				attachmentFileName: true,
				attachmentResourceType: true,
				sender: {
					select: {
						fullName: true,
					},
				},
				conversation: {
					select: {
						id: true,
						title: true,
						members: {
							select: {
								userId: true,
							},
						},
					},
				},
			},
		});

		if (!message) {
			return res.status(404).json({ error: "Group message not found" });
		}

		await deleteMessageEverywhere(message);
		await logDeveloperAudit(req.user, {
			action: "GROUP_MESSAGE_DELETED",
			entityType: "MESSAGE",
			entityId: messageId,
			entityLabel: message.conversation?.title || "Group message",
			summary: `${req.user.fullName} deleted a group message`,
			details: {
				conversationId,
				senderName: message.sender?.fullName || null,
				hadAudio: Boolean(message.audio),
				hadAttachment: Boolean(message.attachmentUrl),
				preview:
					typeof message.message === "string" && message.message.trim()
						? message.message.slice(0, 180)
						: message.attachmentFileName || null,
			},
		});
		emitConversationsRefreshRequired(
			(message.conversation?.members || []).map((member) => member.userId),
			{ conversationId }
		);
		emitDeveloperWorkspaceRefresh({
			action: "GROUP_MESSAGE_DELETED",
			entityType: "MESSAGE",
			entityId: messageId,
		});
		return res.status(200).json({ message: "Group message deleted successfully", messageId });
	} catch (error) {
		return handleDeveloperError(error, res, "deleteDeveloperGroupMessage");
	}
};

export const deleteDeveloperGroup = async (req, res) => {
	try {
		ensureDeveloperPermission(
			req.user,
			"deleteGroups",
			"Only the primary developer or a delegated developer can delete groups"
		);
		const { id } = req.params;
		const group = await prisma.conversation.findFirst({
			where: {
				id,
				type: CONVERSATION_TYPES.GROUP,
			},
			select: {
				id: true,
				isPrivate: true,
				members: {
					select: {
						userId: true,
					},
				},
			},
		});

		if (!group) {
			return res.status(404).json({ error: "Group not found" });
		}

		await prisma.conversation.delete({
			where: { id },
		});

		emitDeveloperConversationRemoved(
			id,
			group.members.map((member) => member.userId)
		);

		if (!group.isPrivate) {
			emitDeveloperPublicGroupsChanged();
		}

		await logDeveloperAudit(req.user, {
			action: "GROUP_DELETED",
			entityType: "GROUP",
			entityId: id,
			entityLabel: "Deleted group",
			summary: `${req.user.fullName} deleted a group`,
			details: {
				conversationId: id,
				memberCount: group.members.length,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "GROUP_DELETED",
			entityType: "GROUP",
			entityId: id,
		});

		return res.status(200).json({ message: "Group deleted successfully", conversationId: id });
	} catch (error) {
		return handleDeveloperError(error, res, "deleteDeveloperGroup");
	}
};

export const updateDeveloperUserRole = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to manage user roles");
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
			return res.status(200).json({
				message: "Role already set",
				user: toUserDto(existingUser, { includeDeveloperPermissions: true }),
			});
		}

		if (existingUser.role === DEVELOPER_ROLE && role !== DEVELOPER_ROLE) {
			await ensureAnotherDeveloperExists(existingUser.id);
		}

		const updatedUser = await prisma.user.update({
			where: { id },
			data: {
				role,
				...(role === DEVELOPER_ROLE ? {} : { developerPermissions: DEFAULT_DEVELOPER_PERMISSIONS }),
			},
		});

		await logDeveloperAudit(req.user, {
			action: "USER_ROLE_UPDATED",
			entityType: "USER",
			entityId: id,
			entityLabel: `${updatedUser.fullName} (@${updatedUser.username})`,
			summary: `${req.user.fullName} changed a user role to ${role.toLowerCase()}`,
			details: {
				previousRole: existingUser.role,
				nextRole: role,
			},
		});
		emitSessionUserUpdated(updatedUser);
		emitPublicUserUpdated(updatedUser);
		emitDeveloperWorkspaceRefresh({
			action: "USER_ROLE_UPDATED",
			entityType: "USER",
			entityId: id,
		});

		return res.status(200).json({
			message: role === DEVELOPER_ROLE ? "User promoted to developer" : "User switched to regular access",
			user: toUserDto(updatedUser, { includeDeveloperPermissions: true }),
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
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to manage bans");
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
				user: toUserDto(existingUser, { includeDeveloperPermissions: true }),
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

		await logDeveloperAudit(req.user, {
			action: shouldBan ? "USER_BANNED" : "USER_UNBANNED",
			entityType: "USER",
			entityId: id,
			entityLabel: `${updatedUser.fullName} (@${updatedUser.username})`,
			summary: shouldBan
				? `${req.user.fullName} banned a user`
				: `${req.user.fullName} removed a user ban`,
			details: {
				reason: bannedReason || null,
			},
		});
		if (!shouldBan) {
			emitSessionUserUpdated(updatedUser);
		}
		emitDeveloperWorkspaceRefresh({
			action: shouldBan ? "USER_BANNED" : "USER_UNBANNED",
			entityType: "USER",
			entityId: id,
		});

		return res.status(200).json({
			message: shouldBan ? "User banned successfully" : "User ban removed successfully",
			user: toUserDto(updatedUser, { includeDeveloperPermissions: true }),
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
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to manage verification");
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
				user: toUserDto(existingUser, { includeDeveloperPermissions: true }),
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

		await logDeveloperAudit(req.user, {
			action: isVerified ? "USER_VERIFIED" : "USER_VERIFICATION_REMOVED",
			entityType: "USER",
			entityId: id,
			entityLabel: `${updatedUser.fullName} (@${updatedUser.username})`,
			summary: isVerified
				? `${req.user.fullName} verified a user`
				: `${req.user.fullName} removed a verification badge`,
			details: null,
		});
		emitSessionUserUpdated(updatedUser);
		emitPublicUserUpdated(updatedUser);
		emitDeveloperWorkspaceRefresh({
			action: isVerified ? "USER_VERIFIED" : "USER_VERIFICATION_REMOVED",
			entityType: "USER",
			entityId: id,
		});

		return res.status(200).json({
			message: isVerified ? "User verified successfully" : "Verification removed successfully",
			user: toUserDto(updatedUser, { includeDeveloperPermissions: true }),
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
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to archive users");
		const { isArchived } = req.body ?? {};

		if (typeof isArchived !== "boolean") {
			return res.status(400).json({ error: "Invalid archive status" });
		}

		const result = await setDeveloperUserArchiveState(req.user, req.params.id, isArchived);
		await logDeveloperAudit(req.user, {
			action: isArchived ? "USER_ARCHIVED" : "USER_RESTORED",
			entityType: "USER",
			entityId: req.params.id,
			entityLabel: `${result.user.fullName} (@${result.user.username})`,
			summary: isArchived
				? `${req.user.fullName} archived a user`
				: `${req.user.fullName} restored a user`,
			details: null,
		});
		if (!isArchived) {
			emitSessionUserUpdated({
				id: result.user._id,
				...result.user,
			});
		}
		emitDeveloperWorkspaceRefresh({
			action: isArchived ? "USER_ARCHIVED" : "USER_RESTORED",
			entityType: "USER",
			entityId: req.params.id,
		});
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
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to archive users");
		const result = await setDeveloperUserArchiveState(req.user, req.params.id, true);
		await logDeveloperAudit(req.user, {
			action: "USER_ARCHIVED",
			entityType: "USER",
			entityId: req.params.id,
			entityLabel: `${result.user.fullName} (@${result.user.username})`,
			summary: `${req.user.fullName} archived a user from developer control`,
			details: {
				viaDeleteAction: true,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "USER_ARCHIVED",
			entityType: "USER",
			entityId: req.params.id,
		});
		return res.status(200).json(result);
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "deleteDeveloperUser");
	}
};

export const updateDeveloperUserPermissions = async (req, res) => {
	try {
		ensurePrimaryDeveloper(req.user);

		const { id } = req.params;
		if (id === req.user._id) {
			return res.status(400).json({ error: "Primary developer permissions are managed automatically" });
		}

		const existingUser = await prisma.user.findUnique({
			where: { id },
			select: developerUserSelect,
		});

		if (!existingUser) {
			return res.status(404).json({ error: "User not found" });
		}

		if (existingUser.role !== DEVELOPER_ROLE) {
			return res.status(400).json({ error: "Only developer accounts can receive developer permissions" });
		}

		if (existingUser.isPrimaryDeveloper) {
			return res.status(400).json({ error: "Primary developer permissions are managed automatically" });
		}

		const nextPermissions = normalizeDeveloperPermissions({
			...DEFAULT_DEVELOPER_PERMISSIONS,
			...(req.body?.permissions || {}),
		});

		const updatedUser = await prisma.user.update({
			where: { id },
			data: {
				developerPermissions: nextPermissions,
			},
		});

		await logDeveloperAudit(req.user, {
			action: "DEVELOPER_PERMISSIONS_UPDATED",
			entityType: "USER",
			entityId: id,
			entityLabel: `${updatedUser.fullName} (@${updatedUser.username})`,
			summary: `${req.user.fullName} updated developer permissions`,
			details: {
				permissions: nextPermissions,
			},
		});
		emitSessionUserUpdated(updatedUser);
		emitDeveloperWorkspaceRefresh({
			action: "DEVELOPER_PERMISSIONS_UPDATED",
			entityType: "USER",
			entityId: id,
		});

		return res.status(200).json({
			message: "Developer permissions updated successfully",
			user: toUserDto(updatedUser, { includeDeveloperPermissions: true }),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperError(error, res, "updateDeveloperUserPermissions");
	}
};
