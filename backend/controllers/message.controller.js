import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { upload, cloudinary } from "../utils/cloudinary.js";

export const sendMessage = async (req, res) => {
	try {
		const { message, repliedMessageId } = req.body;
		const { id: receiverId } = req.params;
		const senderId = req.user._id;

		let conversation = await Conversation.findOne({
			participants: { $all: [senderId, receiverId] },
		});

		if (!conversation) {
			conversation = await Conversation.create({
				participants: [senderId, receiverId],
			});
		}

		const newMessage = new Message({
			senderId,
			receiverId,
			message,
			audio: req.file ? req.file.path : null,
			repliedMessageId: repliedMessageId || null,
		});

		if (newMessage) {
			conversation.messages.push(newMessage._id);
		}

		// this will run in parallel
		await Promise.all([conversation.save(), newMessage.save()]);

		// Fetch the full message with populated repliedMessageId before emitting and responding
		const fullMessage = await Message.findById(newMessage._id).populate("repliedMessageId");

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
		res.status(500).json({ error: "Internal server error" });
	}
};

export const getMessages = async (req, res) => {
	try {
		const { id: userToChatId } = req.params;
		const senderId = req.user._id;

		const conversation = await Conversation.findOne({
			participants: { $all: [senderId, userToChatId] },
		}).populate({
			path: "messages",
			populate: {
				path: "repliedMessageId",
				model: "Message",
			},
		}); // NOT REFERENCE BUT ACTUAL MESSAGES WITH REPLIED MESSAGE POPULATED

		if (!conversation) return res.status(200).json([]);

		const messages = conversation.messages;

		res.status(200).json(messages);
	} catch (error) {
		console.log("Error in getMessages controller: ", error.message);
		res.status(500).json({ error: "Internal server error" });
	}
};

export const markMessagesAsSeen = async (req, res) => {
	try {
		const { id: userToChatId } = req.params;
		const senderId = req.user._id;

		const conversation = await Conversation.findOne({
			participants: { $all: [senderId, userToChatId] },
		}).populate("messages");

		if (!conversation) return res.status(200).json({ message: "No conversation found" });

		// Mark all messages from the other user as seen
		const unseenMessages = conversation.messages.filter(
			(msg) => msg.receiverId.toString() === senderId.toString() && !msg.isSeen
		);

		if (unseenMessages.length > 0) {
			await Message.updateMany(
				{
					_id: { $in: unseenMessages.map((msg) => msg._id) },
					receiverId: senderId,
					isSeen: false,
				},
				{ isSeen: true }
			);

			// Emit socket event to notify sender
			const receiverSocketId = getReceiverSocketId(userToChatId);
			if (receiverSocketId) {
				io.to(receiverSocketId).emit("messagesSeen", {
					conversationId: senderId.toString(),
					messageIds: unseenMessages.map((msg) => msg._id.toString()),
				});
			}
		}

		res.status(200).json({ message: "Messages marked as seen" });
	} catch (error) {
		console.log("Error in markMessagesAsSeen controller: ", error.message);
		res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteMessage = async (req, res) => {
	try {
		const { id } = req.params;
		const userId = req.user._id;
		const { deleteType } = req.query; // "me" or "everyone"

		const message = await Message.findById(id);
		if (!message) {
			return res.status(404).json({ error: "Message not found" });
		}

		// Check if the user is the sender of the message
		if (deleteType === "everyone") {
			if (message.senderId.toString() !== userId.toString()) {
				return res.status(403).json({ error: "Unauthorized to delete this message for everyone" });
			}
		} else if (deleteType === "me") {
			// Allow any participant to delete for themselves
			const isParticipant = [message.senderId.toString(), message.receiverId.toString()].includes(userId.toString());
			if (!isParticipant) {
				return res.status(403).json({ error: "Unauthorized to delete this message for yourself" });
			}
		} else {
			return res.status(400).json({ error: "Invalid deleteType parameter" });
		}

		if (deleteType === "me") {
			// Add userId to deletedFor array if not already present
			if (!message.deletedFor.includes(userId)) {
				message.deletedFor.push(userId);
				await message.save();
			}
			return res.status(200).json({ message: "Message deleted for you" });
		} else if (deleteType === "everyone") {
			// If message has audio, delete from Cloudinary
			if (message.audio) {
				try {
					// Extract public_id from the audio URL more robustly
					const urlParts = message.audio.split('/');
					const fileName = urlParts[urlParts.length - 1];
					const publicId = `chat_audios/${fileName.split('.')[0]}`;
					await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
				} catch (cloudinaryError) {
					console.error("Cloudinary deletion error:", cloudinaryError);
				}
			}

			// Remove message from conversation's messages array
			await Conversation.updateOne(
				{ participants: { $all: [message.senderId, message.receiverId] } },
				{ $pull: { messages: message._id } }
			);

			// Delete the message document
			await Message.findByIdAndDelete(id);

			// Emit socket event to notify all participants about message deletion
			const conversation = await Conversation.findOne({
				participants: { $all: [message.senderId, message.receiverId] },
			});
			if (conversation) {
				conversation.participants.forEach((participantId) => {
					const socketId = getReceiverSocketId(participantId.toString());
					if (socketId) {
						io.to(socketId).emit("deleteMessage", { messageId: id });
					}
				});
			}

			return res.status(200).json({ message: "Message deleted for everyone" });
		}
	} catch (error) {
		console.log("Error in deleteMessage controller: ", error.message);
		res.status(500).json({ error: "Internal server error" });
	}
};
