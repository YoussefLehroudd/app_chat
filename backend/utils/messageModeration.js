import { prisma } from "../db/prisma.js";
import { cloudinary } from "./cloudinary.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

const CLOUDINARY_UPLOAD_SEGMENT = "/upload/";

const getCloudinaryPublicId = (assetUrl) => {
	if (!assetUrl || typeof assetUrl !== "string" || !assetUrl.includes(CLOUDINARY_UPLOAD_SEGMENT)) {
		return null;
	}

	try {
		const parsedUrl = new URL(assetUrl);
		const uploadSegmentIndex = parsedUrl.pathname.indexOf(CLOUDINARY_UPLOAD_SEGMENT);
		if (uploadSegmentIndex === -1) return null;

		const uploadedPath = parsedUrl.pathname.slice(uploadSegmentIndex + CLOUDINARY_UPLOAD_SEGMENT.length);
		return uploadedPath.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
	} catch {
		return null;
	}
};

const deleteCloudinaryAsset = async (assetUrl, resourceType = "image") => {
	const publicId = getCloudinaryPublicId(assetUrl);
	if (!publicId) return;

	try {
		await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
	} catch (error) {
		console.error(`Cloudinary deletion error for ${publicId}:`, error);
	}
};

const emitMessageDeleted = async (conversationId, messageId) => {
	const conversation = await prisma.conversation.findUnique({
		where: { id: conversationId },
		select: { userOneId: true, userTwoId: true },
	});

	if (!conversation) return;

	[conversation.userOneId, conversation.userTwoId].forEach((participantId) => {
		const socketId = getReceiverSocketId(participantId);
		if (socketId) {
			io.to(socketId).emit("deleteMessage", { messageId });
		}
	});
};

const deleteMessageEverywhere = async (message) => {
	if (!message) return;

	await prisma.message.delete({ where: { id: message.id } });
	await emitMessageDeleted(message.conversationId, message.id);

	if (message.audio) {
		void deleteCloudinaryAsset(message.audio, "video");
	}
};

export { deleteCloudinaryAsset, deleteMessageEverywhere };
