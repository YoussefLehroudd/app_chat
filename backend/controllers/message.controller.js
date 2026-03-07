import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { deleteMessageEverywhere } from "../utils/messageModeration.js";
import { toMessageDto } from "../utils/formatters.js";

const getConversationPair = (userAId, userBId) => {
	return userAId < userBId
		? { userOneId: userAId, userTwoId: userBId }
		: { userOneId: userBId, userTwoId: userAId };
};

const findConversationByUsers = async (userAId, userBId) => {
	const { userOneId, userTwoId } = getConversationPair(userAId, userBId);
	return prisma.conversation.findUnique({
		where: { userOneId_userTwoId: { userOneId, userTwoId } },
	});
};

const findOrCreateConversation = async (userAId, userBId) => {
	let conversation = await findConversationByUsers(userAId, userBId);

	if (!conversation) {
		const { userOneId, userTwoId } = getConversationPair(userAId, userBId);
		conversation = await prisma.conversation.create({
			data: { userOneId, userTwoId },
		});
	}

	return conversation;
};

const getChatUserAvailability = async (userId) =>
	prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, isArchived: true, isBanned: true },
	});

export const sendMessage = async (req, res) => {
	try {
		const { message, repliedMessageId, clientMessageId, audioDurationSeconds } = req.body;
		const { id: receiverId } = req.params;
		const senderId = req.user._id;
		const parsedAudioDurationSeconds = Number.parseInt(audioDurationSeconds, 10);

		if (!message && !req.file) {
			return res.status(400).json({ error: "Message or audio is required" });
		}

		const receiver = await getChatUserAvailability(receiverId);

		if (!receiver) {
			return res.status(404).json({ error: "User not found" });
		}

		if (receiver.isBanned || receiver.isArchived) {
			return res.status(403).json({ error: "You cannot send messages to this account" });
		}

		const conversation = await findOrCreateConversation(senderId, receiverId);

		const newMessage = await prisma.message.create({
			data: {
				conversationId: conversation.id,
				senderId,
				receiverId,
				message: message || null,
				audio: req.file ? req.file.path : null,
				audioDurationSeconds:
					Number.isFinite(parsedAudioDurationSeconds) && parsedAudioDurationSeconds >= 0
						? parsedAudioDurationSeconds
						: null,
				repliedMessageId: repliedMessageId || null,
			},
			include: { repliedMessage: true },
		});

		const fullMessage = {
			...toMessageDto(newMessage),
			clientMessageId: clientMessageId || null,
		};

		// SOCKET IO FUNCTIONALITY WILL GO HERE
		const receiverSocketId = getReceiverSocketId(receiverId);
		const senderSocketId = getReceiverSocketId(senderId.toString());
		if (receiverSocketId) {
			// io.to(<socket_id>).emit() used to send events to specific client
			io.to(receiverSocketId).emit("newMessage", fullMessage);
		}
		if (senderSocketId && senderSocketId !== receiverSocketId) {
			io.to(senderSocketId).emit("newMessage", fullMessage);
		}

		res.status(201).json(fullMessage);
	} catch (error) {
		console.log("Error in sendMessage controller: ", error.message);
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
		const userToChat = await getChatUserAvailability(userToChatId);

		if (!userToChat || userToChat.isArchived || userToChat.isBanned) {
			return res.status(404).json({ error: "User not available" });
		}

		const conversation = await findConversationByUsers(senderId, userToChatId);

		if (!conversation) return res.status(200).json([]);

		const messages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				NOT: {
					deletedFor: {
						has: senderId,
					},
				},
			},
			orderBy: { createdAt: "asc" },
			include: { repliedMessage: true },
		});

		res.status(200).json(messages.map((msg) => toMessageDto(msg)));
	} catch (error) {
		console.log("Error in getMessages controller: ", error.message);
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

		const conversation = await findConversationByUsers(senderId, userToChatId);

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
				where: { id: { in: unseenMessages.map((msg) => msg.id) } },
				data: { isSeen: true },
			});

			// Emit socket event to notify sender
			const receiverSocketId = getReceiverSocketId(userToChatId);
			if (receiverSocketId) {
				io.to(receiverSocketId).emit("messagesSeen", {
					conversationId: senderId.toString(),
					messageIds: unseenMessages.map((msg) => msg.id),
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

export const deleteConversation = async (req, res) => {
	try {
		const { id: userToChatId } = req.params;
		const userId = req.user._id;

		const conversation = await findConversationByUsers(userId, userToChatId);
		if (!conversation) {
			return res.status(200).json({ message: "Conversation deleted" });
		}

		const visibleMessages = await prisma.message.findMany({
			where: {
				conversationId: conversation.id,
				NOT: {
					deletedFor: {
						has: userId,
					},
				},
			},
			select: { id: true },
		});

		if (visibleMessages.length > 0) {
			await prisma.$transaction(
				visibleMessages.map((message) =>
					prisma.message.update({
						where: { id: message.id },
						data: { deletedFor: { push: userId } },
					})
				)
			);
		}

		return res.status(200).json({ message: "Conversation deleted" });
	} catch (error) {
		console.log("Error in deleteConversation controller: ", error.message);
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
		const { deleteType } = req.query; // "me" or "everyone"

		const message = await prisma.message.findUnique({ where: { id } });
		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		// Check if the user is the sender of the message
		if (deleteType === "everyone") {
			if (message.senderId !== userId) {
				return res.status(403).json({ error: "Unauthorized to delete this message for everyone" });
			}
		} else if (deleteType === "me") {
			// Allow any participant to delete for themselves
			const isParticipant = [message.senderId, message.receiverId].includes(userId);
			if (!isParticipant) {
				return res.status(403).json({ error: "Unauthorized to delete this message for yourself" });
			}
		} else {
			return res.status(400).json({ error: "Invalid deleteType parameter" });
		}

		if (deleteType === "me") {
			// Add userId to deletedFor array if not already present
			if (!message.deletedFor.includes(userId)) {
				await prisma.message.update({
					where: { id },
					data: { deletedFor: { push: userId } },
				});
			}
			return res.status(200).json({ message: "Message deleted for you" });
		} else if (deleteType === "everyone") {
			await deleteMessageEverywhere(message);

			return res.status(200).json({ message: "Message deleted for everyone" });
		}
	} catch (error) {
		console.log("Error in deleteMessage controller: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};
