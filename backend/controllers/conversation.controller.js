import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { getUserSocketIds, io } from "../socket/socket.js";
import { toConversationItemDto, toMessageDto, toUserDto } from "../utils/formatters.js";
import {
	CONVERSATION_MEMBER_ROLES,
	CONVERSATION_TYPES,
	findOrCreateDirectConversation,
	getGroupConversationForMember,
} from "../utils/conversations.js";
import {
	GROUP_INVITE_STATUSES,
	buildGroupMemberLeftSystemMessage,
	buildGroupMemberJoinedByInviteSystemMessage,
	buildGroupMemberRemovedSystemMessage,
	buildGroupInviteMessage,
	parseCallMessageContent,
	parseSystemMessageContent,
	parseGroupInviteMessageContent,
	updateGroupInviteMessageStatus,
} from "../utils/systemMessages.js";

const buildVisibleMessageInclude = (viewerId) => ({
	where: {
		NOT: {
			deletedFor: {
				has: viewerId,
			},
		},
	},
	orderBy: { createdAt: "desc" },
	take: 1,
	select: {
		message: true,
		audio: true,
		attachmentType: true,
		attachmentFileName: true,
		createdAt: true,
	},
});

const userSelect = {
	id: true,
	fullName: true,
	username: true,
	role: true,
	isPrimaryDeveloper: true,
	isVerified: true,
	verifiedAt: true,
	profilePic: true,
	gender: true,
	bio: true,
	lastSeen: true,
	createdAt: true,
	updatedAt: true,
};

const groupConversationInclude = {
	members: {
		include: {
			user: {
				select: userSelect,
			},
		},
		orderBy: { joinedAt: "asc" },
	},
};

const groupSystemMessageInclude = {
	sender: {
		select: userSelect,
	},
	conversation: {
		select: {
			type: true,
		},
	},
};

const directMessageInclude = {
	sender: {
		select: userSelect,
	},
	conversation: {
		select: {
			type: true,
		},
	},
};

const parseGroupMemberLimit = (memberLimit) => {
	if (memberLimit === null || memberLimit === undefined || memberLimit === "") {
		return null;
	}

	const parsedValue = Number.parseInt(memberLimit, 10);
	if (!Number.isFinite(parsedValue) || parsedValue < 2) {
		return Number.NaN;
	}

	return parsedValue;
};

const getLatestMessagePreview = (latestMessage) => {
	if (!latestMessage) return null;
	if (latestMessage.audio) return "Audio message";
	if (latestMessage.attachmentType) {
		return latestMessage.attachmentFileName?.trim() || (latestMessage.attachmentType === "IMAGE"
			? "Photo"
			: latestMessage.attachmentType === "VIDEO"
				? "Video"
				: latestMessage.attachmentType === "PDF"
					? "PDF"
					: "File");
	}

	const parsedSystemMessage = parseSystemMessageContent(latestMessage.message);
	if (parsedSystemMessage) {
		return parsedSystemMessage.text;
	}

	const parsedGroupInvite = parseGroupInviteMessageContent(latestMessage.message);
	if (parsedGroupInvite) {
		return "Group invitation";
	}

	const parsedCallMessage = parseCallMessageContent(latestMessage.message);
	if (parsedCallMessage) {
		return parsedCallMessage.previewText || "Call";
	}

	return latestMessage.message?.trim() || "Message";
};

const emitToUsers = (userIds, eventName, payload) => {
	[...new Set(userIds.filter(Boolean))].forEach((userId) => {
		const socketIds = getUserSocketIds(userId);
		socketIds.forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const buildGroupConversationItemForUser = async (conversationId, viewerId) => {
	const conversation = await prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: CONVERSATION_TYPES.GROUP,
			members: {
				some: { userId: viewerId },
			},
		},
		include: {
			...groupConversationInclude,
			messages: buildVisibleMessageInclude(viewerId),
		},
	});

	if (!conversation) return null;

	const currentMember = conversation.members.find((member) => member.userId === viewerId);
	const unreadCount = await prisma.message.count({
		where: {
			conversationId: conversation.id,
			senderId: { not: viewerId },
			...(currentMember?.lastReadAt
				? {
						createdAt: {
							gt: currentMember.lastReadAt,
						},
				  }
				: {}),
			NOT: {
				deletedFor: {
					has: viewerId,
				},
			},
		},
	});

	const latestMessage = conversation.messages[0];

	return toConversationItemDto(
		{
			...conversation,
			lastMessage: getLatestMessagePreview(latestMessage),
			lastMessageAt: latestMessage?.createdAt ?? null,
			unreadCount,
			groupRole: currentMember?.role ?? null,
		},
		viewerId
	);
};

const emitGroupConversationUpsert = async (conversationId, userIds) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

	await Promise.all(
		uniqueUserIds.map(async (userId) => {
			const conversation = await buildGroupConversationItemForUser(conversationId, userId);
			if (!conversation) return;
			emitToUsers([userId], "conversationUpserted", conversation);
		})
	);
};

const emitGroupConversationRemoved = (conversationId, userIds) => {
	emitToUsers(userIds, "conversationRemoved", { conversationId });
};

const emitMessageUpdated = (userIds, payload) => {
	emitToUsers(userIds, "messageUpdated", payload);
};

const emitPublicGroupsChanged = () => {
	io.emit("publicGroupsChanged");
};

const getManagedGroupConversation = async (conversationId, userId) =>
	getGroupConversationForMember(conversationId, userId, {
		include: groupConversationInclude,
	});

const getGroupConversationById = async (conversationId) =>
	prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: CONVERSATION_TYPES.GROUP,
		},
		include: groupConversationInclude,
	});

const isGroupManagerRole = (role) =>
	role === CONVERSATION_MEMBER_ROLES.OWNER || role === CONVERSATION_MEMBER_ROLES.ADMIN;

const requireGroupOwner = (conversation, userId) => {
	const currentMember = conversation?.members?.find((member) => member.userId === userId);
	if (!currentMember) return { ok: false, error: "Group not found", status: 404 };
	if (currentMember.role !== CONVERSATION_MEMBER_ROLES.OWNER) {
		return { ok: false, error: "Only the group owner can perform this action", status: 403 };
	}

	return { ok: true, currentMember };
};

const requireGroupManager = (conversation, userId) => {
	const currentMember = conversation?.members?.find((member) => member.userId === userId);
	if (!currentMember) return { ok: false, error: "Group not found", status: 404 };
	if (!isGroupManagerRole(currentMember.role)) {
		return { ok: false, error: "Only the group owner or admins can perform this action", status: 403 };
	}

	return { ok: true, currentMember };
};

const getAvailableUsersByIds = async (userIds) =>
	prisma.user.findMany({
		where: {
			id: { in: userIds },
			isArchived: false,
			isBanned: false,
		},
		select: { id: true },
	});

const emitGroupSystemMessage = async ({ conversationId, senderId, rawMessage, userIds }) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
	if (!rawMessage || uniqueUserIds.length === 0) {
		return null;
	}

	const message = await prisma.message.create({
		data: {
			conversationId,
			senderId,
			receiverId: null,
			message: rawMessage,
		},
		include: groupSystemMessageInclude,
	});

	const formattedMessage = toMessageDto(message);
	emitToUsers(uniqueUserIds, "newMessage", formattedMessage);
	return formattedMessage;
};

const sendDirectPayloadMessage = async ({ senderId, receiverId, rawMessage }) => {
	const directConversation = await findOrCreateDirectConversation(senderId, receiverId);
	const message = await prisma.message.create({
		data: {
			conversationId: directConversation.id,
			senderId,
			receiverId,
			message: rawMessage,
		},
		include: directMessageInclude,
	});

	const formattedMessage = toMessageDto(message);
	emitToUsers([senderId, receiverId], "newMessage", formattedMessage);
	return formattedMessage;
};

export const getSidebarConversations = async (req, res) => {
	try {
		const loggedInUserId = req.user._id;

		const [directConversations, groupConversations, users] = await Promise.all([
			prisma.conversation.findMany({
				where: {
					type: CONVERSATION_TYPES.DIRECT,
					OR: [{ userOneId: loggedInUserId }, { userTwoId: loggedInUserId }],
				},
				include: {
					userOne: { select: userSelect },
					userTwo: { select: userSelect },
					messages: buildVisibleMessageInclude(loggedInUserId),
				},
			}),
			prisma.conversation.findMany({
				where: {
					type: CONVERSATION_TYPES.GROUP,
					OR: [
						{
							members: {
								some: { userId: loggedInUserId },
							},
						},
						{
							isPrivate: false,
						},
					],
				},
				include: {
					...groupConversationInclude,
					messages: buildVisibleMessageInclude(loggedInUserId),
				},
			}),
			prisma.user.findMany({
				where: {
					id: { not: loggedInUserId },
					isArchived: false,
					isBanned: false,
				},
				select: userSelect,
			}),
		]);

		const directPreviewByUserId = new Map();

		await Promise.all(
			directConversations.map(async (conversation) => {
				const otherUserId = conversation.userOneId === loggedInUserId ? conversation.userTwoId : conversation.userOneId;
				if (!otherUserId) return;

				const latestMessage = conversation.messages[0];
				const unreadCount = await prisma.message.count({
					where: {
						conversationId: conversation.id,
						receiverId: loggedInUserId,
						isSeen: false,
						NOT: {
							deletedFor: {
								has: loggedInUserId,
							},
						},
					},
				});

				directPreviewByUserId.set(otherUserId, {
					conversationId: conversation.id,
					lastMessage: getLatestMessagePreview(latestMessage),
					lastMessageAt: latestMessage?.createdAt ?? null,
					unreadCount,
				});
			})
		);

		const directItems = users.map((user) => {
			const preview = directPreviewByUserId.get(user.id);
			const dto = toUserDto({
				...user,
				lastMessage: preview?.lastMessage ?? null,
				lastMessageAt: preview?.lastMessageAt ?? null,
				unreadCount: preview?.unreadCount ?? 0,
			});

			return {
				...dto,
				conversationId: preview?.conversationId ?? null,
				type: CONVERSATION_TYPES.DIRECT,
				isGroup: false,
				isPrivate: false,
				memberLimit: null,
				memberCount: 2,
				groupRole: null,
				members: [],
			};
		});

		const groupItems = await Promise.all(
			groupConversations.map(async (conversation) => {
				const latestMessage = conversation.messages[0];
				const currentMember = conversation.members.find((member) => member.userId === loggedInUserId);
				const isMember = Boolean(currentMember);

				const unreadCount = isMember
					? await prisma.message.count({
							where: {
								conversationId: conversation.id,
								senderId: { not: loggedInUserId },
								...(currentMember?.lastReadAt
									? {
											createdAt: {
												gt: currentMember.lastReadAt,
											},
									  }
									: {}),
								NOT: {
									deletedFor: {
										has: loggedInUserId,
									},
								},
							},
					  })
					: 0;

				return toConversationItemDto(
					{
						...conversation,
						lastMessage: getLatestMessagePreview(latestMessage),
						lastMessageAt: latestMessage?.createdAt ?? null,
						unreadCount,
						groupRole: currentMember?.role ?? null,
						isMember,
					},
					loggedInUserId
				);
			})
		);

		const sidebarItems = [...directItems, ...groupItems].sort((itemA, itemB) => {
			const itemATime = itemA.lastMessageAt ? new Date(itemA.lastMessageAt).getTime() : 0;
			const itemBTime = itemB.lastMessageAt ? new Date(itemB.lastMessageAt).getTime() : 0;
			return itemBTime - itemATime;
		});

		res.status(200).json(sidebarItems);
	} catch (error) {
		console.error("Error in getSidebarConversations:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const createGroupConversation = async (req, res) => {
	try {
		const creatorId = req.user._id;
		const { title, description, isPrivate, memberLimit, memberIds } = req.body;

		const normalizedTitle = typeof title === "string" ? title.trim() : "";
		if (!normalizedTitle) {
			return res.status(400).json({ error: "Group name is required" });
		}

		const normalizedMemberIds = Array.isArray(memberIds)
			? [...new Set(memberIds.filter((memberId) => typeof memberId === "string" && memberId && memberId !== creatorId))]
			: [];

		if (normalizedMemberIds.length === 0) {
			return res.status(400).json({ error: "Select at least one member" });
		}

		const nextMemberLimit = parseGroupMemberLimit(memberLimit);
		if (Number.isNaN(nextMemberLimit)) {
			return res.status(400).json({ error: "Member limit must be at least 2" });
		}

		const allMemberIds = [creatorId, ...normalizedMemberIds];

		if (nextMemberLimit && allMemberIds.length > nextMemberLimit) {
			return res.status(400).json({ error: "Member limit is lower than the selected members count" });
		}

		const members = await getAvailableUsersByIds(normalizedMemberIds);

		if (members.length !== normalizedMemberIds.length) {
			return res.status(400).json({ error: "One or more selected users are unavailable" });
		}

		const now = new Date();
		const conversation = await prisma.conversation.create({
			data: {
				type: CONVERSATION_TYPES.GROUP,
				title: normalizedTitle,
				description: typeof description === "string" ? description.trim() : "",
				isPrivate: Boolean(isPrivate),
				memberLimit: nextMemberLimit,
				createdById: creatorId,
				profilePic: req.file?.path || "",
				members: {
					create: allMemberIds.map((userId) => ({
						userId,
						role:
							userId === creatorId
								? CONVERSATION_MEMBER_ROLES.OWNER
								: CONVERSATION_MEMBER_ROLES.MEMBER,
						lastReadAt: now,
					})),
				},
			},
		});

		const createdConversation = await buildGroupConversationItemForUser(conversation.id, creatorId);
		await emitGroupConversationUpsert(conversation.id, allMemberIds);
		if (!conversation.isPrivate) {
			emitPublicGroupsChanged();
		}

		res.status(201).json(createdConversation);
	} catch (error) {
		console.error("Error in createGroupConversation:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const updateGroupConversation = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const { title, description, isPrivate, memberLimit } = req.body;

		const conversation = await getManagedGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const data = {};
		if (typeof title === "string") {
			const normalizedTitle = title.trim();
			if (!normalizedTitle) {
				return res.status(400).json({ error: "Group name is required" });
			}
			data.title = normalizedTitle;
		}

		if (typeof description === "string") {
			data.description = description.trim();
		}

		if (typeof isPrivate !== "undefined") {
			data.isPrivate = isPrivate === true || isPrivate === "true";
		}

		if (typeof memberLimit !== "undefined") {
			const nextMemberLimit = parseGroupMemberLimit(memberLimit);
			if (Number.isNaN(nextMemberLimit)) {
				return res.status(400).json({ error: "Member limit must be at least 2" });
			}
			if (nextMemberLimit && conversation.members.length > nextMemberLimit) {
				return res.status(400).json({ error: "Member limit cannot be lower than the current members count" });
			}
			data.memberLimit = nextMemberLimit;
		}

		if (req.file?.path) {
			data.profilePic = req.file.path;
		}

		if (Object.keys(data).length === 0) {
			const currentConversation = await buildGroupConversationItemForUser(conversationId, userId);
			return res.status(200).json(currentConversation);
		}

		await prisma.conversation.update({
			where: { id: conversationId },
			data,
		});

		await emitGroupConversationUpsert(
			conversationId,
			conversation.members.map((member) => member.userId)
		);
		emitPublicGroupsChanged();

		const updatedConversation = await buildGroupConversationItemForUser(conversationId, userId);
		res.status(200).json(updatedConversation);
	} catch (error) {
		console.error("Error in updateGroupConversation:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const addGroupMembers = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const { memberIds } = req.body;

		const conversation = await getManagedGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const currentMemberIds = new Set(conversation.members.map((member) => member.userId));
		const normalizedMemberIds = Array.isArray(memberIds)
			? [...new Set(memberIds.filter((memberId) => typeof memberId === "string" && memberId && !currentMemberIds.has(memberId)))]
			: [];

		if (normalizedMemberIds.length === 0) {
			return res.status(400).json({ error: "Select at least one new member" });
		}

		if (conversation.memberLimit && conversation.members.length + normalizedMemberIds.length > conversation.memberLimit) {
			return res.status(400).json({ error: "Member limit reached" });
		}

		const availableUsers = await getAvailableUsersByIds(normalizedMemberIds);
		if (availableUsers.length !== normalizedMemberIds.length) {
			return res.status(400).json({ error: "One or more selected users are unavailable" });
		}

		await prisma.conversationMember.createMany({
			data: normalizedMemberIds.map((memberId) => ({
				conversationId,
				userId: memberId,
				role: CONVERSATION_MEMBER_ROLES.MEMBER,
				lastReadAt: null,
			})),
		});

		const nextMemberIds = [...conversation.members.map((member) => member.userId), ...normalizedMemberIds];
		await emitGroupConversationUpsert(conversationId, nextMemberIds);
		if (!conversation.isPrivate) {
			emitPublicGroupsChanged();
		}

		const updatedConversation = await buildGroupConversationItemForUser(conversationId, userId);
		res.status(200).json(updatedConversation);
	} catch (error) {
		console.error("Error in addGroupMembers:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const removeGroupMember = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, memberId } = req.params;

		const conversation = await getManagedGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		if (memberId === userId) {
			return res.status(400).json({ error: "Use leave group to exit your own group" });
		}

		const targetMember = conversation.members.find((member) => member.userId === memberId);
		if (!targetMember) {
			return res.status(404).json({ error: "Member not found" });
		}

		if (targetMember.role === CONVERSATION_MEMBER_ROLES.OWNER) {
			return res.status(400).json({ error: "The group owner cannot be removed" });
		}

		await prisma.conversationMember.delete({
			where: {
				conversationId_userId: {
					conversationId,
					userId: memberId,
				},
			},
		});

		const remainingMemberIds = conversation.members
			.filter((member) => member.userId !== memberId)
			.map((member) => member.userId);

		await emitGroupSystemMessage({
			conversationId,
			senderId: userId,
			rawMessage: buildGroupMemberRemovedSystemMessage({
				actorName: managerCheck.currentMember.user?.fullName,
				targetName: targetMember.user?.fullName,
			}),
			userIds: remainingMemberIds,
		});

		await emitGroupConversationUpsert(conversationId, remainingMemberIds);
		if (!conversation.isPrivate) {
			emitPublicGroupsChanged();
		}
		emitGroupConversationRemoved(conversationId, [memberId]);

		const updatedConversation = await buildGroupConversationItemForUser(conversationId, userId);
		res.status(200).json(updatedConversation);
	} catch (error) {
		console.error("Error in removeGroupMember:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const updateGroupMemberRole = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, memberId } = req.params;
		const normalizedRole = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "";

		if (
			![
				CONVERSATION_MEMBER_ROLES.OWNER,
				CONVERSATION_MEMBER_ROLES.ADMIN,
				CONVERSATION_MEMBER_ROLES.MEMBER,
			].includes(normalizedRole)
		) {
			return res.status(400).json({ error: "Invalid member role" });
		}

		const conversation = await getManagedGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const targetMember = conversation.members.find((member) => member.userId === memberId);
		if (!targetMember) {
			return res.status(404).json({ error: "Member not found" });
		}

		if (targetMember.role === CONVERSATION_MEMBER_ROLES.OWNER && normalizedRole !== CONVERSATION_MEMBER_ROLES.OWNER) {
			return res.status(400).json({ error: "The group owner role cannot be changed" });
		}

		if (normalizedRole === CONVERSATION_MEMBER_ROLES.OWNER) {
			const ownershipCheck = requireGroupOwner(conversation, userId);
			if (!ownershipCheck.ok) {
				return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
			}

			if (memberId === userId) {
				return res.status(400).json({ error: "You are already the group owner" });
			}

			await prisma.$transaction([
				prisma.conversationMember.update({
					where: {
						conversationId_userId: {
							conversationId,
							userId,
						},
					},
					data: {
						role: CONVERSATION_MEMBER_ROLES.ADMIN,
					},
				}),
				prisma.conversationMember.update({
					where: {
						conversationId_userId: {
							conversationId,
							userId: memberId,
						},
					},
					data: {
						role: CONVERSATION_MEMBER_ROLES.OWNER,
					},
				}),
				prisma.conversation.update({
					where: { id: conversationId },
					data: { createdById: memberId },
				}),
			]);
		} else if (targetMember.role !== normalizedRole) {
			await prisma.conversationMember.update({
				where: {
					conversationId_userId: {
						conversationId,
						userId: memberId,
					},
				},
				data: {
					role: normalizedRole,
				},
			});
		}

		await emitGroupConversationUpsert(
			conversationId,
			conversation.members.map((member) => member.userId)
		);
		if (!conversation.isPrivate) {
			emitPublicGroupsChanged();
		}

		const updatedConversation = await buildGroupConversationItemForUser(conversationId, userId);
		res.status(200).json(updatedConversation);
	} catch (error) {
		console.error("Error in updateGroupMemberRole:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const joinPublicGroupConversation = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const conversation = await getGroupConversationById(conversationId);

		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		if (conversation.isPrivate) {
			return res.status(403).json({ error: "Only invited users can join this private group" });
		}

		const currentMember = conversation.members.find((member) => member.userId === userId);
		if (!currentMember) {
			if (conversation.memberLimit && conversation.members.length >= conversation.memberLimit) {
				return res.status(400).json({ error: "Member limit reached" });
			}

			await prisma.conversationMember.create({
				data: {
					conversationId,
					userId,
					role: CONVERSATION_MEMBER_ROLES.MEMBER,
					lastReadAt: new Date(),
				},
			});
		}

		const memberIds = [...new Set([...conversation.members.map((member) => member.userId), userId])];
		await emitGroupConversationUpsert(conversationId, memberIds);
		emitPublicGroupsChanged();

		const joinedConversation = await buildGroupConversationItemForUser(conversationId, userId);
		return res.status(200).json(joinedConversation);
	} catch (error) {
		console.error("Error in joinPublicGroupConversation:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const sendGroupInvitation = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const { recipientId } = req.body;

		if (typeof recipientId !== "string" || !recipientId.trim()) {
			return res.status(400).json({ error: "Recipient is required" });
		}

		const conversation = await getManagedGroupConversation(conversationId, userId);
		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const currentMember = conversation.members.find((member) => member.userId === userId);
		if (!currentMember) {
			return res.status(403).json({ error: "Only group members can send invitations" });
		}

		const normalizedRecipientId = recipientId.trim();
		if (normalizedRecipientId === userId) {
			return res.status(400).json({ error: "You are already in this group" });
		}

		const targetMember = conversation.members.find((member) => member.userId === normalizedRecipientId);
		if (targetMember) {
			return res.status(400).json({ error: "This user is already a member" });
		}

		const [recipient] = await getAvailableUsersByIds([normalizedRecipientId]);
		if (!recipient) {
			return res.status(404).json({ error: "User not found" });
		}

		const invitationMessage = await sendDirectPayloadMessage({
			senderId: userId,
			receiverId: normalizedRecipientId,
			rawMessage: buildGroupInviteMessage({
				groupId: conversation.id,
				groupTitle: conversation.title,
				groupDescription: conversation.description,
				groupProfilePic: conversation.profilePic,
				isPrivate: conversation.isPrivate,
				inviterId: userId,
				inviterName: currentMember.user?.fullName,
				status: GROUP_INVITE_STATUSES.PENDING,
			}),
		});

		return res.status(201).json(invitationMessage);
	} catch (error) {
		console.error("Error in sendGroupInvitation:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const respondToGroupInvitation = async (req, res) => {
	try {
		const userId = req.user._id;
		const { messageId } = req.params;
		const normalizedAction = typeof req.body?.action === "string" ? req.body.action.trim().toUpperCase() : "";

		if (!["ACCEPT", "DECLINE"].includes(normalizedAction)) {
			return res.status(400).json({ error: "Invalid invitation action" });
		}

		const invitationMessage = await prisma.message.findUnique({
			where: { id: messageId },
			include: directMessageInclude,
		});

		if (!invitationMessage || invitationMessage.receiverId !== userId) {
			return res.status(404).json({ error: "Invitation not found" });
		}

		const invitation = parseGroupInviteMessageContent(invitationMessage.message);
		if (!invitation) {
			return res.status(400).json({ error: "This message is not a valid group invitation" });
		}

		if (invitation.status !== GROUP_INVITE_STATUSES.PENDING) {
			return res.status(400).json({ error: "This invitation has already been handled" });
		}

		let joinedConversation = null;
		let joinedMemberIds = [];
		let shouldEmitInviteJoinMessage = false;
		if (normalizedAction === "ACCEPT") {
			const conversation = await getGroupConversationById(invitation.groupId);

			if (!conversation) {
				return res.status(404).json({ error: "This group no longer exists" });
			}

			const currentMember = conversation.members.find((member) => member.userId === userId);
			if (!currentMember) {
				if (conversation.memberLimit && conversation.members.length >= conversation.memberLimit) {
					return res.status(400).json({ error: "Member limit reached" });
				}

				await prisma.conversationMember.create({
					data: {
						conversationId: conversation.id,
						userId,
						role: CONVERSATION_MEMBER_ROLES.MEMBER,
						lastReadAt: new Date(),
					},
				});
				shouldEmitInviteJoinMessage = true;
			}

			joinedMemberIds = [...new Set([...conversation.members.map((member) => member.userId), userId])];
			if (shouldEmitInviteJoinMessage) {
				await emitGroupSystemMessage({
					conversationId: conversation.id,
					senderId: invitation.inviterId,
					rawMessage: buildGroupMemberJoinedByInviteSystemMessage({
						actorName: invitation.inviterName,
						targetName: req.user?.fullName,
					}),
					userIds: joinedMemberIds,
				});
			}

			await emitGroupConversationUpsert(conversation.id, joinedMemberIds);
			if (!conversation.isPrivate) {
				emitPublicGroupsChanged();
			}
			joinedConversation = await buildGroupConversationItemForUser(conversation.id, userId);
		}

		const nextStatus =
			normalizedAction === "ACCEPT" ? GROUP_INVITE_STATUSES.ACCEPTED : GROUP_INVITE_STATUSES.DECLINED;
		const updatedInvitationMessage = await prisma.message.update({
			where: { id: messageId },
			data: {
				message: updateGroupInviteMessageStatus(invitationMessage.message, nextStatus),
			},
			include: directMessageInclude,
		});

		const formattedInvitationMessage = toMessageDto(updatedInvitationMessage);
		emitMessageUpdated(
			[updatedInvitationMessage.senderId, updatedInvitationMessage.receiverId],
			formattedInvitationMessage
		);

		return res.status(200).json({
			message: formattedInvitationMessage,
			joinedConversation,
		});
	} catch (error) {
		console.error("Error in respondToGroupInvitation:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const leaveGroupConversation = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const conversation = await getManagedGroupConversation(conversationId, userId);

		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const currentMember = conversation.members.find((member) => member.userId === userId);
		const remainingMembers = conversation.members.filter((member) => member.userId !== userId);

		if (currentMember?.role === CONVERSATION_MEMBER_ROLES.OWNER) {
			if (remainingMembers.length > 0) {
				return res.status(400).json({ error: "Transfer ownership to another member before leaving the group" });
			}

			if (remainingMembers.length === 0) {
				await prisma.conversation.delete({
					where: { id: conversationId },
				});
				if (!conversation.isPrivate) {
					emitPublicGroupsChanged();
				}
			}
		} else {
			await prisma.conversationMember.delete({
				where: {
					conversationId_userId: {
						conversationId,
						userId,
					},
				},
			});

			await emitGroupSystemMessage({
				conversationId,
				senderId: userId,
				rawMessage: buildGroupMemberLeftSystemMessage({
					memberName: currentMember?.user?.fullName,
				}),
				userIds: remainingMembers.map((member) => member.userId),
			});

			await emitGroupConversationUpsert(
				conversationId,
				remainingMembers.map((member) => member.userId)
			);
			if (!conversation.isPrivate) {
				emitPublicGroupsChanged();
			}
		}

		emitGroupConversationRemoved(conversationId, [userId]);
		res.status(200).json({ message: "Left group successfully", conversationId });
	} catch (error) {
		console.error("Error in leaveGroupConversation:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteGroupConversationPermanently = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const conversation = await getManagedGroupConversation(conversationId, userId);

		const ownershipCheck = requireGroupOwner(conversation, userId);
		if (!ownershipCheck.ok) {
			return res.status(ownershipCheck.status).json({ error: ownershipCheck.error });
		}

		const memberIds = conversation.members.map((member) => member.userId);

		await prisma.conversation.delete({
			where: { id: conversationId },
		});

		emitGroupConversationRemoved(conversationId, memberIds);
		if (!conversation.isPrivate) {
			emitPublicGroupsChanged();
		}
		res.status(200).json({ message: "Group deleted successfully", conversationId });
	} catch (error) {
		console.error("Error in deleteGroupConversationPermanently:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};
