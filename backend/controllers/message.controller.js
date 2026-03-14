import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { Readable } from "stream";
import { getUserSocketIds, io } from "../socket/socket.js";
import { deleteMessageEverywhere } from "../utils/messageModeration.js";
import {
	CONVERSATION_MEMBER_ROLES,
	CONVERSATION_TYPES,
	DIRECT_CONVERSATION_STATUSES,
	findDirectConversationByUsers,
	getGroupConversationForMember,
} from "../utils/conversations.js";
import { toMessageDto } from "../utils/formatters.js";
import { getBlockStatus } from "../utils/chatRelationships.js";

const DEFAULT_MESSAGE_PAGE_LIMIT = 40;
const MAX_MESSAGE_PAGE_LIMIT = 100;
const MAX_SEARCH_RESULTS = 50;
const REACTION_EMOJI_MAX_LENGTH = 24;

const normalizeMessagePageLimit = (rawLimit) => {
	const parsedLimit = Number.parseInt(rawLimit, 10);
	if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) return DEFAULT_MESSAGE_PAGE_LIMIT;
	return Math.min(parsedLimit, MAX_MESSAGE_PAGE_LIMIT);
};

const parseBeforeCursor = (rawValue) => {
	if (typeof rawValue !== "string" || !rawValue.trim()) return null;
	const parsedDate = new Date(rawValue);
	if (Number.isNaN(parsedDate.getTime())) return null;
	return parsedDate;
};

const buildPaginatedMessagesResponse = (records, limit, viewerId = null) => {
	const hasMore = records.length > limit;
	const pageRecords = hasMore ? records.slice(0, limit) : records;
	const messages = pageRecords.reverse().map((message) => toMessageDto(message, { viewerId }));
	return {
		messages,
		pageInfo: {
			hasMore,
			limit,
			oldestMessageAt: messages.length > 0 ? messages[0].createdAt : null,
		},
	};
};

const parsedMessageDuration = (audioDurationSeconds) => {
	const parsedValue = Number.parseInt(audioDurationSeconds, 10);
	return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
};

const normalizeMessageText = (value) => {
	if (typeof value !== "string") return "";
	return value.trim();
};

const getUploadedFile = (files, fieldName) => {
	const uploadedField = files?.[fieldName];
	return Array.isArray(uploadedField) && uploadedField.length > 0 ? uploadedField[0] : null;
};

const getAttachmentType = (file) => {
	const mimeType = file?.mimetype || "";
	const originalName = file?.originalname?.toLowerCase() || "";

	if (mimeType.startsWith("image/")) return "IMAGE";
	if (mimeType.startsWith("video/")) return "VIDEO";
	if (mimeType === "application/pdf" || originalName.endsWith(".pdf")) return "PDF";
	return "FILE";
};

const getAttachmentResourceType = (file) => {
	const mimeType = file?.mimetype || "";

	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("video/")) return "video";
	return "raw";
};

const sanitizeDownloadFilename = (fileName) => {
	if (typeof fileName !== "string") return "attachment";

	const sanitizedName = fileName
		.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
		.replace(/\s+/g, " ")
		.trim();

	return sanitizedName || "attachment";
};

const encodeContentDispositionFilename = (fileName) =>
	encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, "%2A");

const buildNestedReplyInclude = (viewerId = null) => ({
	sender: true,
	conversation: {
		select: {
			type: true,
		},
	},
	reactions: {
		select: {
			emoji: true,
			userId: true,
			createdAt: true,
		},
	},
	pinnedEntries: {
		select: {
			id: true,
			conversationId: true,
			messageId: true,
			pinnedById: true,
			createdAt: true,
		},
	},
	savedEntries: viewerId
		? {
				where: {
					userId: viewerId,
				},
				select: {
					userId: true,
					messageId: true,
					createdAt: true,
				},
		  }
		: {
				select: {
					userId: true,
					messageId: true,
					createdAt: true,
				},
		  },
});

const buildMessageInclude = (viewerId = null) => ({
	sender: true,
	conversation: {
		select: {
			id: true,
			type: true,
			userOneId: true,
			userTwoId: true,
			disappearingMessagesSeconds: true,
			members: {
				select: {
					userId: true,
				},
			},
		},
	},
	repliedMessage: {
		include: buildNestedReplyInclude(viewerId),
	},
	reactions: {
		select: {
			emoji: true,
			userId: true,
			createdAt: true,
		},
	},
	pinnedEntries: {
		select: {
			id: true,
			conversationId: true,
			messageId: true,
			pinnedById: true,
			createdAt: true,
		},
	},
	savedEntries: viewerId
		? {
				where: {
					userId: viewerId,
				},
				select: {
					userId: true,
					messageId: true,
					createdAt: true,
				},
		  }
		: {
				select: {
					userId: true,
					messageId: true,
					createdAt: true,
				},
		  },
});

const getChatUserAvailability = async (userId) =>
	prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			isArchived: true,
			isBanned: true,
			showReadReceipts: true,
			showTypingStatus: true,
		},
	});

const getParticipantUserIds = (conversation) =>
	conversation?.type === CONVERSATION_TYPES.GROUP
		? (conversation.members || []).map((member) => member.userId).filter(Boolean)
		: [conversation?.userOneId, conversation?.userTwoId].filter(Boolean);

const emitMessageToUsers = (userIds, payload) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

	uniqueUserIds.forEach((userId) => {
		const socketIds = getUserSocketIds(userId);
		socketIds.forEach((socketId) => {
			io.to(socketId).emit("newMessage", payload);
		});
	});
};

const emitEventToUsers = (userIds, eventName, payload) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

	uniqueUserIds.forEach((userId) => {
		const socketIds = getUserSocketIds(userId);
		socketIds.forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const emitPersonalizedMessageEvent = (userIds, eventName, messageRecord, extraPayload = {}) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

	uniqueUserIds.forEach((userId) => {
		const payload = {
			...toMessageDto(messageRecord, { viewerId: userId }),
			...extraPayload,
		};

		getUserSocketIds(userId).forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const getSearchModeWhere = (mode, query) => {
	const normalizedMode = typeof mode === "string" ? mode.trim().toLowerCase() : "all";
	const normalizedQuery = normalizeMessageText(query);

	if (normalizedMode === "files") {
		if (!normalizedQuery) {
			return {
				OR: [
					{
						attachmentUrl: {
							not: null,
						},
					},
					{
						audio: {
							not: null,
						},
					},
				],
			};
		}

		return {
			AND: [
				{
					OR: [
						{
							attachmentUrl: {
								not: null,
							},
						},
						{
							audio: {
								not: null,
							},
						},
					],
				},
				{
					OR: [
						{
							attachmentFileName: {
								contains: normalizedQuery,
								mode: "insensitive",
							},
						},
						{
							message: {
								contains: normalizedQuery,
								mode: "insensitive",
							},
						},
					],
				},
			],
		};
	}

	if (normalizedMode === "links") {
		const linkCondition = {
			OR: [
				{
					message: {
						contains: "http://",
						mode: "insensitive",
					},
				},
				{
					message: {
						contains: "https://",
						mode: "insensitive",
					},
				},
			],
		};

		if (!normalizedQuery) {
			return linkCondition;
		}

		return {
			AND: [
				linkCondition,
				{
					message: {
						contains: normalizedQuery,
						mode: "insensitive",
					},
				},
			],
		};
	}

	if (!normalizedQuery) {
		return null;
	}

	return {
		OR: [
			{
				message: {
					contains: normalizedQuery,
					mode: "insensitive",
				},
			},
			{
				attachmentFileName: {
					contains: normalizedQuery,
					mode: "insensitive",
				},
			},
		],
	};
};

const getMessageAccessWhere = (messageId, viewerId) => ({
	id: messageId,
	NOT: {
		deletedFor: {
			has: viewerId,
		},
	},
	OR: [
		{
			conversation: {
				type: CONVERSATION_TYPES.DIRECT,
				OR: [{ userOneId: viewerId }, { userTwoId: viewerId }],
			},
		},
		{
			conversation: {
				type: CONVERSATION_TYPES.GROUP,
				members: {
					some: {
						userId: viewerId,
					},
				},
			},
		},
	],
});

const getAccessibleMessage = async (messageId, viewerId) =>
	prisma.message.findFirst({
		where: getMessageAccessWhere(messageId, viewerId),
		include: buildMessageInclude(viewerId),
	});

const getAccessibleConversationById = (conversationId, viewerId) =>
	prisma.conversation.findFirst({
		where: {
			id: conversationId,
			OR: [
				{
					type: CONVERSATION_TYPES.DIRECT,
					OR: [{ userOneId: viewerId }, { userTwoId: viewerId }],
				},
				{
					type: CONVERSATION_TYPES.GROUP,
					members: {
						some: {
							userId: viewerId,
						},
					},
				},
			],
		},
		select: {
			id: true,
			type: true,
			userOneId: true,
			userTwoId: true,
			disappearingMessagesSeconds: true,
			members: {
				select: {
					userId: true,
				},
			},
		},
	});

const buildGalleryItems = (messages, viewerId) =>
	(messages || [])
		.map((message) => toMessageDto(message, { viewerId }))
		.filter((message) => message.audio || message.attachment);

const applyDeliveredReceiptForDirectConversation = async ({ conversationId, viewerId, otherUserId }) => {
	if (!conversationId || !viewerId || !otherUserId) return;

	const undeliveredMessages = await prisma.message.findMany({
		where: {
			conversationId,
			senderId: otherUserId,
			receiverId: viewerId,
			deliveredAt: null,
			NOT: {
				deletedFor: {
					has: viewerId,
				},
			},
		},
		select: {
			id: true,
		},
	});

	if (undeliveredMessages.length === 0) return;

	const deliveredAt = new Date();
	await prisma.message.updateMany({
		where: {
			id: {
				in: undeliveredMessages.map((message) => message.id),
			},
		},
		data: {
			deliveredAt,
		},
	});

	emitEventToUsers([otherUserId], "messagesDelivered", {
		conversationId: viewerId,
		messageIds: undeliveredMessages.map((message) => message.id),
		deliveredAt: deliveredAt.toISOString(),
	});
};

const getDirectConversationMessages = async (viewerId, userToChatId, { before = null, limit = DEFAULT_MESSAGE_PAGE_LIMIT } = {}) => {
	const conversation = await findDirectConversationByUsers(viewerId, userToChatId);

	if (!conversation || conversation.directStatus !== DIRECT_CONVERSATION_STATUSES.ACCEPTED) {
		return {
			messages: [],
			pageInfo: {
				hasMore: false,
				limit,
				oldestMessageAt: null,
			},
		};
	}

	const where = {
		conversationId: conversation.id,
		NOT: {
			deletedFor: {
				has: viewerId,
			},
		},
	};

	if (before) {
		where.createdAt = {
			lt: before,
		};
	}

	const messages = await prisma.message.findMany({
		where,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: limit + 1,
		include: buildMessageInclude(viewerId),
	});

	await applyDeliveredReceiptForDirectConversation({
		conversationId: conversation.id,
		viewerId,
		otherUserId: userToChatId,
	});

	return buildPaginatedMessagesResponse(messages, limit, viewerId);
};

const getGroupConversationMessages = async (
	viewerId,
	conversationId,
	{ before = null, limit = DEFAULT_MESSAGE_PAGE_LIMIT } = {}
) => {
	const conversation = await getGroupConversationForMember(conversationId, viewerId);

	if (!conversation) {
		return null;
	}

	const where = {
		conversationId: conversation.id,
		NOT: {
			deletedFor: {
				has: viewerId,
			},
		},
	};

	if (before) {
		where.createdAt = {
			lt: before,
		};
	}

	const messages = await prisma.message.findMany({
		where,
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: limit + 1,
		include: buildMessageInclude(viewerId),
	});

	return buildPaginatedMessagesResponse(messages, limit, viewerId);
};

export const sendMessage = async (req, res) => {
	try {
		const { message, repliedMessageId, clientMessageId, audioDurationSeconds } = req.body;
		const { id: receiverId } = req.params;
		const senderId = req.user._id;
		const audioFile = getUploadedFile(req.files, "audio");
		const attachmentFile = getUploadedFile(req.files, "attachment");
		const normalizedMessage = normalizeMessageText(message);

		if (!normalizedMessage && !audioFile && !attachmentFile) {
			return res.status(400).json({ error: "Message, voice note, or attachment is required" });
		}

		if (audioFile && attachmentFile) {
			return res.status(400).json({ error: "Send one upload at a time" });
		}

		const receiver = await getChatUserAvailability(receiverId);

		if (!receiver) {
			return res.status(404).json({ error: "User not found" });
		}

		if (receiver.isBanned || receiver.isArchived) {
			return res.status(403).json({ error: "You cannot send messages to this account" });
		}

		const blockStatus = await getBlockStatus(senderId, receiverId);
		if (blockStatus.isBlocked) {
			return res.status(403).json({
				error: blockStatus.blockedByCurrentUser
					? "Unblock this user before sending messages"
					: "This user is not accepting messages from you",
			});
		}

		const conversation = await findDirectConversationByUsers(senderId, receiverId);
		if (!conversation) {
			return res.status(403).json({ error: "Send an invitation first" });
		}

		if (conversation.directStatus !== DIRECT_CONVERSATION_STATUSES.ACCEPTED) {
			if (conversation.directInitiatorId === senderId) {
				return res.status(403).json({ error: "Wait until this user accepts your invitation" });
			}
			return res.status(403).json({ error: "Accept the invitation before chatting" });
		}

		const newMessage = await prisma.message.create({
			data: {
				conversationId: conversation.id,
				senderId,
				receiverId,
				deliveredAt: getUserSocketIds(receiverId).length > 0 ? new Date() : null,
				message: normalizedMessage || null,
				audio: audioFile ? audioFile.path : null,
				audioDurationSeconds: audioFile ? parsedMessageDuration(audioDurationSeconds) : null,
				attachmentUrl: attachmentFile ? attachmentFile.path : null,
				attachmentType: attachmentFile ? getAttachmentType(attachmentFile) : null,
				attachmentMimeType: attachmentFile?.mimetype || null,
				attachmentFileName: attachmentFile?.originalname || null,
				attachmentFileSize: Number.isFinite(attachmentFile?.size) ? attachmentFile.size : null,
				attachmentResourceType: attachmentFile ? getAttachmentResourceType(attachmentFile) : null,
				repliedMessageId: repliedMessageId || null,
				expiresAt: conversation.disappearingMessagesSeconds
					? new Date(Date.now() + conversation.disappearingMessagesSeconds * 1000)
					: null,
			},
			include: buildMessageInclude(senderId),
		});

		const fullMessage = {
			...toMessageDto(newMessage, { viewerId: senderId }),
			clientMessageId: clientMessageId || null,
		};

		emitPersonalizedMessageEvent([receiverId, senderId], "newMessage", newMessage, {
			clientMessageId: clientMessageId || null,
		});

		res.status(201).json(fullMessage);
	} catch (error) {
		console.log("Error in sendMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const sendGroupMessage = async (req, res) => {
	try {
		const { message, repliedMessageId, clientMessageId, audioDurationSeconds } = req.body;
		const { id: conversationId } = req.params;
		const senderId = req.user._id;
		const audioFile = getUploadedFile(req.files, "audio");
		const attachmentFile = getUploadedFile(req.files, "attachment");
		const normalizedMessage = normalizeMessageText(message);

		if (!normalizedMessage && !audioFile && !attachmentFile) {
			return res.status(400).json({ error: "Message, voice note, or attachment is required" });
		}

		if (audioFile && attachmentFile) {
			return res.status(400).json({ error: "Send one upload at a time" });
		}

		const conversation = await getGroupConversationForMember(conversationId, senderId, {
			include: {
				members: {
					select: { userId: true, role: true },
				},
			},
		});

		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const senderMembership = conversation.members.find((member) => member.userId === senderId);
		const isSlowModeExempt = [
			CONVERSATION_MEMBER_ROLES.OWNER,
			CONVERSATION_MEMBER_ROLES.ADMIN,
			CONVERSATION_MEMBER_ROLES.MODERATOR,
		].includes(senderMembership?.role);

		if (conversation.slowModeSeconds && !isSlowModeExempt) {
			const lastOwnMessage = await prisma.message.findFirst({
				where: {
					conversationId: conversation.id,
					senderId,
				},
				orderBy: { createdAt: "desc" },
				select: { createdAt: true },
			});

			if (lastOwnMessage?.createdAt) {
				const elapsedMs = Date.now() - new Date(lastOwnMessage.createdAt).getTime();
				const remainingMs = conversation.slowModeSeconds * 1000 - elapsedMs;

				if (remainingMs > 0) {
					return res.status(429).json({
						error: `Slow mode is active. Wait ${Math.ceil(remainingMs / 1000)}s before sending again.`,
					});
				}
			}
		}

		const newMessage = await prisma.message.create({
			data: {
				conversationId: conversation.id,
				senderId,
				receiverId: null,
				message: normalizedMessage || null,
				audio: audioFile ? audioFile.path : null,
				audioDurationSeconds: audioFile ? parsedMessageDuration(audioDurationSeconds) : null,
				attachmentUrl: attachmentFile ? attachmentFile.path : null,
				attachmentType: attachmentFile ? getAttachmentType(attachmentFile) : null,
				attachmentMimeType: attachmentFile?.mimetype || null,
				attachmentFileName: attachmentFile?.originalname || null,
				attachmentFileSize: Number.isFinite(attachmentFile?.size) ? attachmentFile.size : null,
				attachmentResourceType: attachmentFile ? getAttachmentResourceType(attachmentFile) : null,
				repliedMessageId: repliedMessageId || null,
				expiresAt: conversation.disappearingMessagesSeconds
					? new Date(Date.now() + conversation.disappearingMessagesSeconds * 1000)
					: null,
			},
			include: buildMessageInclude(senderId),
		});

		await prisma.conversationMember.update({
			where: {
				conversationId_userId: {
					conversationId: conversation.id,
					userId: senderId,
				},
			},
			data: {
				lastReadAt: new Date(),
			},
		});

		const fullMessage = {
			...toMessageDto(newMessage, { viewerId: senderId }),
			clientMessageId: clientMessageId || null,
		};

		emitPersonalizedMessageEvent(
			conversation.members.map((member) => member.userId),
			"newMessage",
			newMessage,
			{
				clientMessageId: clientMessageId || null,
			}
		);

		res.status(201).json(fullMessage);
	} catch (error) {
		console.log("Error in sendGroupMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const getMessages = async (req, res) => {
	try {
		const { id: userToChatId } = req.params;
		const senderId = req.user._id;
		const before = parseBeforeCursor(req.query.before);
		const limit = normalizeMessagePageLimit(req.query.limit);
		const userToChat = await getChatUserAvailability(userToChatId);

		if (req.query.before && !before) {
			return res.status(400).json({ error: "Invalid before cursor" });
		}

		if (!userToChat || userToChat.isArchived || userToChat.isBanned) {
			return res.status(404).json({ error: "User not available" });
		}

		const blockStatus = await getBlockStatus(senderId, userToChatId);
		if (blockStatus.isBlocked) {
			return res.status(403).json({
				error: blockStatus.blockedByCurrentUser
					? "You blocked this user"
					: "This user is not available to you",
			});
		}

		const paginatedMessages = await getDirectConversationMessages(senderId, userToChatId, { before, limit });
		res.status(200).json(paginatedMessages);
	} catch (error) {
		console.log("Error in getMessages controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const getGroupMessages = async (req, res) => {
	try {
		const { id: conversationId } = req.params;
		const userId = req.user._id;
		const before = parseBeforeCursor(req.query.before);
		const limit = normalizeMessagePageLimit(req.query.limit);

		if (req.query.before && !before) {
			return res.status(400).json({ error: "Invalid before cursor" });
		}

		const paginatedMessages = await getGroupConversationMessages(userId, conversationId, { before, limit });

		if (!paginatedMessages) {
			return res.status(404).json({ error: "Group not found" });
		}

		res.status(200).json(paginatedMessages);
	} catch (error) {
		console.log("Error in getGroupMessages controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const downloadMessageAttachment = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;

		const message = await prisma.message.findFirst({
			where: {
				id,
				attachmentUrl: {
					not: null,
				},
				NOT: {
					deletedFor: {
						has: userId,
					},
				},
				OR: [
					{
						conversation: {
							type: CONVERSATION_TYPES.DIRECT,
							OR: [{ userOneId: userId }, { userTwoId: userId }],
						},
					},
					{
						conversation: {
							type: CONVERSATION_TYPES.GROUP,
							members: {
								some: {
									userId,
								},
							},
						},
					},
				],
			},
			select: {
				id: true,
				attachmentUrl: true,
				attachmentMimeType: true,
				attachmentFileName: true,
			},
		});

		if (!message?.attachmentUrl) {
			return res.status(404).json({ error: "Attachment not found" });
		}

		const upstreamResponse = await fetch(message.attachmentUrl);

		if (!upstreamResponse.ok || !upstreamResponse.body) {
			return res.status(502).json({ error: "Failed to download attachment" });
		}

		const downloadFileName = sanitizeDownloadFilename(message.attachmentFileName || "attachment");
		const contentType =
			message.attachmentMimeType || upstreamResponse.headers.get("content-type") || "application/octet-stream";
		const contentLength = upstreamResponse.headers.get("content-length");

		res.setHeader("Content-Type", contentType);
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${downloadFileName}"; filename*=UTF-8''${encodeContentDispositionFilename(downloadFileName)}`
		);

		if (contentLength) {
			res.setHeader("Content-Length", contentLength);
		}

		Readable.fromWeb(upstreamResponse.body).pipe(res);
	} catch (error) {
		console.log("Error in downloadMessageAttachment controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const markMessagesAsSeen = async (req, res) => {
	try {
		const { id: userToChatId } = req.params;
		const senderId = req.user._id;
		const userToChat = await getChatUserAvailability(userToChatId);

		if (!userToChat || userToChat.isArchived || userToChat.isBanned) {
			return res.status(404).json({ error: "User not available" });
		}

		const conversation = await findDirectConversationByUsers(senderId, userToChatId);

		if (!conversation) return res.status(200).json({ message: "No conversation found" });

		const unseenMessages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				receiverId: senderId,
				isSeen: false,
				NOT: {
					deletedFor: {
						has: senderId,
					},
				},
			},
			select: { id: true },
		});

		if (unseenMessages.length > 0) {
			await prisma.message.updateMany({
				where: { id: { in: unseenMessages.map((message) => message.id) } },
				data: { isSeen: true },
			});

			if (req.user.showReadReceipts !== false) {
				emitEventToUsers([userToChatId], "messagesSeen", {
					conversationId: senderId.toString(),
					messageIds: unseenMessages.map((message) => message.id),
				});
			}
		}

		res.status(200).json({ message: "Messages marked as seen" });
	} catch (error) {
		console.log("Error in markMessagesAsSeen controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const searchDirectMessages = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const userToChatId = req.params.id;
		const searchWhere = getSearchModeWhere(req.query.mode, req.query.q);

		if (!searchWhere) {
			return res.status(400).json({ error: "Search query is required" });
		}

		const blockStatus = await getBlockStatus(viewerId, userToChatId);
		if (blockStatus.isBlocked) {
			return res.status(403).json({ error: "This conversation is unavailable" });
		}

		const conversation = await findDirectConversationByUsers(viewerId, userToChatId);
		if (!conversation || conversation.directStatus !== DIRECT_CONVERSATION_STATUSES.ACCEPTED) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		const messages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				NOT: {
					deletedFor: {
						has: viewerId,
					},
				},
				...searchWhere,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: MAX_SEARCH_RESULTS,
			include: buildMessageInclude(viewerId),
		});

		return res.status(200).json({
			results: messages.map((message) => toMessageDto(message, { viewerId })),
		});
	} catch (error) {
		console.log("Error in searchDirectMessages controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const searchGroupMessages = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const conversationId = req.params.id;
		const searchWhere = getSearchModeWhere(req.query.mode, req.query.q);

		if (!searchWhere) {
			return res.status(400).json({ error: "Search query is required" });
		}

		const conversation = await getGroupConversationForMember(conversationId, viewerId);
		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const messages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				NOT: {
					deletedFor: {
						has: viewerId,
					},
				},
				...searchWhere,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: MAX_SEARCH_RESULTS,
			include: buildMessageInclude(viewerId),
		});

		return res.status(200).json({
			results: messages.map((message) => toMessageDto(message, { viewerId })),
		});
	} catch (error) {
		console.log("Error in searchGroupMessages controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getDirectConversationGallery = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const userToChatId = req.params.id;
		const conversation = await findDirectConversationByUsers(viewerId, userToChatId);

		if (!conversation || conversation.directStatus !== DIRECT_CONVERSATION_STATUSES.ACCEPTED) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		const messages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				NOT: {
					deletedFor: {
						has: viewerId,
					},
				},
				OR: [
					{
						audio: {
							not: null,
						},
					},
					{
						attachmentUrl: {
							not: null,
						},
					},
				],
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: 120,
			include: buildMessageInclude(viewerId),
		});

		return res.status(200).json({
			items: buildGalleryItems(messages, viewerId),
		});
	} catch (error) {
		console.log("Error in getDirectConversationGallery controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getGroupConversationGallery = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const conversationId = req.params.id;
		const conversation = await getGroupConversationForMember(conversationId, viewerId);

		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const messages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				NOT: {
					deletedFor: {
						has: viewerId,
					},
				},
				OR: [
					{
						audio: {
							not: null,
						},
					},
					{
						attachmentUrl: {
							not: null,
						},
					},
				],
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: 120,
			include: buildMessageInclude(viewerId),
		});

		return res.status(200).json({
			items: buildGalleryItems(messages, viewerId),
		});
	} catch (error) {
		console.log("Error in getGroupConversationGallery controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const editMessage = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const messageId = req.params.id;
		const nextText = normalizeMessageText(req.body?.message);

		if (!nextText) {
			return res.status(400).json({ error: "Edited message text is required" });
		}

		const message = await getAccessibleMessage(messageId, viewerId);
		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		if (message.senderId !== viewerId) {
			return res.status(403).json({ error: "Only the sender can edit this message" });
		}

		const formattedCurrentMessage = toMessageDto(message, { viewerId });
		if (
			formattedCurrentMessage.isSystem ||
			formattedCurrentMessage.isCallMessage ||
			formattedCurrentMessage.isGroupInvite ||
			formattedCurrentMessage.isStoryInteraction
		) {
			return res.status(400).json({ error: "This message cannot be edited" });
		}

		const updatedMessage = await prisma.message.update({
			where: { id: message.id },
			data: {
				message: nextText,
				editedAt: new Date(),
			},
			include: buildMessageInclude(viewerId),
		});

		const audienceUserIds = getParticipantUserIds(updatedMessage.conversation);
		emitPersonalizedMessageEvent(audienceUserIds, "messageUpdated", updatedMessage);

		return res.status(200).json(toMessageDto(updatedMessage, { viewerId }));
	} catch (error) {
		console.log("Error in editMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const toggleMessageReaction = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const messageId = req.params.id;
		const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";

		if (!emoji || emoji.length > REACTION_EMOJI_MAX_LENGTH) {
			return res.status(400).json({ error: "A valid emoji is required" });
		}

		const message = await getAccessibleMessage(messageId, viewerId);
		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		const existingReaction = await prisma.messageReaction.findUnique({
			where: {
				messageId_userId_emoji: {
					messageId: message.id,
					userId: viewerId,
					emoji,
				},
			},
			select: { messageId: true },
		});

		if (existingReaction) {
			await prisma.messageReaction.delete({
				where: {
					messageId_userId_emoji: {
						messageId: message.id,
						userId: viewerId,
						emoji,
					},
				},
			});
		} else {
			await prisma.messageReaction.create({
				data: {
					messageId: message.id,
					userId: viewerId,
					emoji,
				},
			});
		}

		const refreshedMessage = await prisma.message.findUnique({
			where: { id: message.id },
			include: buildMessageInclude(viewerId),
		});

		const audienceUserIds = getParticipantUserIds(refreshedMessage.conversation);
		emitPersonalizedMessageEvent(audienceUserIds, "messageUpdated", refreshedMessage);

		return res.status(200).json(toMessageDto(refreshedMessage, { viewerId }));
	} catch (error) {
		console.log("Error in toggleMessageReaction controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const toggleSavedMessage = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const messageId = req.params.id;
		const message = await getAccessibleMessage(messageId, viewerId);

		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		const existingSave = await prisma.savedMessage.findUnique({
			where: {
				userId_messageId: {
					userId: viewerId,
					messageId: message.id,
				},
			},
			select: { userId: true },
		});

		if (existingSave) {
			await prisma.savedMessage.delete({
				where: {
					userId_messageId: {
						userId: viewerId,
						messageId: message.id,
					},
				},
			});
		} else {
			await prisma.savedMessage.create({
				data: {
					userId: viewerId,
					messageId: message.id,
				},
			});
		}

		const refreshedMessage = await prisma.message.findUnique({
			where: { id: message.id },
			include: buildMessageInclude(viewerId),
		});

		emitPersonalizedMessageEvent([viewerId], "messageUpdated", refreshedMessage);

		return res.status(200).json({
			message: toMessageDto(refreshedMessage, { viewerId }),
			isSaved: !existingSave,
		});
	} catch (error) {
		console.log("Error in toggleSavedMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getSavedMessages = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const requestedConversationId =
			typeof req.query?.conversationId === "string" ? req.query.conversationId.trim() : "";

		if (requestedConversationId) {
			const conversation = await getAccessibleConversationById(requestedConversationId, viewerId);
			if (!conversation) {
				return res.status(404).json({ error: "Conversation not found" });
			}
		}

		const savedMessages = await prisma.savedMessage.findMany({
			where: {
				userId: viewerId,
				...(requestedConversationId
					? {
							message: {
								conversationId: requestedConversationId,
							},
					  }
					: {}),
			},
			orderBy: {
				createdAt: "desc",
			},
			take: 120,
			select: {
				createdAt: true,
				message: {
					include: buildMessageInclude(viewerId),
				},
			},
		});

		return res.status(200).json({
			items: savedMessages
				.filter((entry) => entry.message)
				.map((entry) => ({
					savedAt: entry.createdAt,
					message: toMessageDto(entry.message, { viewerId }),
				})),
		});
	} catch (error) {
		console.log("Error in getSavedMessages controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const togglePinnedMessage = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const messageId = req.params.id;
		const message = await getAccessibleMessage(messageId, viewerId);

		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		const existingPin = await prisma.pinnedMessage.findFirst({
			where: {
				conversationId: message.conversationId,
				messageId: message.id,
			},
			select: {
				id: true,
			},
		});

		if (existingPin) {
			await prisma.pinnedMessage.delete({
				where: {
					id: existingPin.id,
				},
			});
		} else {
			await prisma.pinnedMessage.create({
				data: {
					conversationId: message.conversationId,
					messageId: message.id,
					pinnedById: viewerId,
				},
			});
		}

		const refreshedMessage = await prisma.message.findUnique({
			where: { id: message.id },
			include: buildMessageInclude(viewerId),
		});

		const audienceUserIds = getParticipantUserIds(refreshedMessage.conversation);
		emitPersonalizedMessageEvent(audienceUserIds, "messageUpdated", refreshedMessage);

		return res.status(200).json({
			message: toMessageDto(refreshedMessage, { viewerId }),
			isPinned: !existingPin,
		});
	} catch (error) {
		console.log("Error in togglePinnedMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getPinnedMessages = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const conversationId = req.params.conversationId;
		const conversation = await getAccessibleConversationById(conversationId, viewerId);

		if (!conversation) {
			return res.status(404).json({ error: "Conversation not found" });
		}

		const pinnedMessages = await prisma.pinnedMessage.findMany({
			where: {
				conversationId: conversation.id,
			},
			orderBy: {
				createdAt: "desc",
			},
			take: 50,
			select: {
				id: true,
				createdAt: true,
				pinnedById: true,
				message: {
					include: buildMessageInclude(viewerId),
				},
			},
		});

		return res.status(200).json({
			items: pinnedMessages
				.filter((entry) => entry.message)
				.map((entry) => ({
					id: entry.id,
					pinnedAt: entry.createdAt,
					pinnedById: entry.pinnedById,
					message: toMessageDto(entry.message, { viewerId }),
				})),
		});
	} catch (error) {
		console.log("Error in getPinnedMessages controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const markGroupConversationAsSeen = async (req, res) => {
	try {
		const { id: conversationId } = req.params;
		const userId = req.user._id;
		const membership = await prisma.conversationMember.findUnique({
			where: {
				conversationId_userId: {
					conversationId,
					userId,
				},
			},
			include: {
				conversation: {
					select: { type: true },
				},
			},
		});

		if (!membership || membership.conversation?.type !== CONVERSATION_TYPES.GROUP) {
			return res.status(404).json({ error: "Group not found" });
		}

		await prisma.conversationMember.update({
			where: {
				conversationId_userId: {
					conversationId,
					userId,
				},
			},
			data: { lastReadAt: new Date() },
		});

		res.status(200).json({ message: "Group marked as read" });
	} catch (error) {
		console.log("Error in markGroupConversationAsSeen controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteConversation = async (req, res) => {
	try {
		const { id: userToChatId } = req.params;
		const userId = req.user._id;

		const conversation = await findDirectConversationByUsers(userId, userToChatId);
		if (!conversation) {
			return res.status(200).json({ message: "Conversation deleted" });
		}

		await prisma.$executeRaw`
			UPDATE "Message"
			SET "deletedFor" = array_append("deletedFor", ${userId})
			WHERE "conversationId" = ${conversation.id}
				AND array_position("deletedFor", ${userId}) IS NULL
		`;

		return res.status(200).json({ message: "Conversation deleted" });
	} catch (error) {
		console.log("Error in deleteConversation controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteGroupConversation = async (req, res) => {
	try {
		const { id: conversationId } = req.params;
		const userId = req.user._id;
		const conversation = await getGroupConversationForMember(conversationId, userId);

		if (!conversation) {
			return res.status(200).json({ message: "Conversation deleted" });
		}

		await prisma.$executeRaw`
			UPDATE "Message"
			SET "deletedFor" = array_append("deletedFor", ${userId})
			WHERE "conversationId" = ${conversation.id}
				AND array_position("deletedFor", ${userId}) IS NULL
		`;

		await prisma.conversationMember.update({
			where: {
				conversationId_userId: {
					conversationId: conversation.id,
					userId,
				},
			},
			data: { lastReadAt: new Date() },
		});

		return res.status(200).json({ message: "Conversation deleted" });
	} catch (error) {
		console.log("Error in deleteGroupConversation controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteMessage = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;
		const { deleteType } = req.query;

		const message = await prisma.message.findUnique({
			where: { id },
			include: {
				conversation: {
					select: {
						type: true,
						members: {
							select: {
								userId: true,
								role: true,
							},
						},
					},
				},
			},
		});

		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		const isGroupMessage = message.conversation?.type === CONVERSATION_TYPES.GROUP;

		if (deleteType === "everyone") {
			if (message.senderId !== userId) {
				return res.status(403).json({ error: "Unauthorized to delete this message for everyone" });
			}
		} else if (deleteType === "me") {
			const isDirectParticipant = [message.senderId, message.receiverId].includes(userId);
			const isGroupParticipant = isGroupMessage
				? message.conversation.members.some((member) => member.userId === userId)
				: false;

			if (!isDirectParticipant && !isGroupParticipant) {
				return res.status(403).json({ error: "Unauthorized to delete this message for yourself" });
			}
		} else {
			return res.status(400).json({ error: "Invalid deleteType parameter" });
		}

		if (deleteType === "me") {
			if (!message.deletedFor.includes(userId)) {
				await prisma.message.update({
					where: { id },
					data: { deletedFor: { push: userId } },
				});
			}
			return res.status(200).json({ message: "Message deleted for you" });
		}

		await deleteMessageEverywhere(message);
		return res.status(200).json({ message: "Message deleted for everyone" });
	} catch (error) {
		console.log("Error in deleteMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};
