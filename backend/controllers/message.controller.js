import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { Readable } from "stream";
import { getUserSocketIds, io } from "../socket/socket.js";
import { deleteMessageEverywhere } from "../utils/messageModeration.js";
import {
	CONVERSATION_TYPES,
	DIRECT_CONVERSATION_STATUSES,
	findDirectConversationByUsers,
	getGroupConversationForMember,
} from "../utils/conversations.js";
import { toMessageDto } from "../utils/formatters.js";

const DEFAULT_MESSAGE_PAGE_LIMIT = 40;
const MAX_MESSAGE_PAGE_LIMIT = 100;

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

const buildPaginatedMessagesResponse = (records, limit) => {
	const hasMore = records.length > limit;
	const pageRecords = hasMore ? records.slice(0, limit) : records;
	const messages = pageRecords.reverse().map((message) => toMessageDto(message));
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

const messageInclude = {
	sender: true,
	conversation: {
		select: {
			type: true,
		},
	},
	repliedMessage: {
		include: {
			sender: true,
			conversation: {
				select: {
					type: true,
				},
			},
		},
	},
};

const getChatUserAvailability = async (userId) =>
	prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, isArchived: true, isBanned: true },
	});

const emitMessageToUsers = (userIds, payload) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

	uniqueUserIds.forEach((userId) => {
		const socketIds = getUserSocketIds(userId);
		socketIds.forEach((socketId) => {
			io.to(socketId).emit("newMessage", payload);
		});
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
		include: messageInclude,
	});

	return buildPaginatedMessagesResponse(messages, limit);
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
		include: messageInclude,
	});

	return buildPaginatedMessagesResponse(messages, limit);
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
			},
			include: messageInclude,
		});

		const fullMessage = {
			...toMessageDto(newMessage),
			clientMessageId: clientMessageId || null,
		};

		emitMessageToUsers([receiverId, senderId], fullMessage);

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
					select: { userId: true },
				},
			},
		});

		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
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
			},
			include: messageInclude,
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
			...toMessageDto(newMessage),
			clientMessageId: clientMessageId || null,
		};

		emitMessageToUsers(
			conversation.members.map((member) => member.userId),
			fullMessage
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

			const receiverSocketIds = getUserSocketIds(userToChatId);
			receiverSocketIds.forEach((socketId) => {
				io.to(socketId).emit("messagesSeen", {
					conversationId: senderId.toString(),
					messageIds: unseenMessages.map((message) => message.id),
				});
			});
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
