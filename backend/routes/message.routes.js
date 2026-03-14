import express from "express";
import {
	deleteConversation,
	deleteGroupConversation,
	deleteMessage,
	downloadMessageAttachment,
	editMessage,
	getDirectConversationGallery,
	getGroupMessages,
	getGroupConversationGallery,
	getMessages,
	getPinnedMessages,
	getSavedMessages,
	markGroupConversationAsSeen,
	markMessagesAsSeen,
	searchDirectMessages,
	searchGroupMessages,
	sendMessage,
	sendGroupMessage,
	toggleMessageReaction,
	togglePinnedMessage,
	toggleSavedMessage,
} from "../controllers/message.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { upload } from "../utils/cloudinary.js";

const router = express.Router();

router.get("/saved", protectRoute, getSavedMessages);
router.get("/pins/:conversationId", protectRoute, getPinnedMessages);
router.get("/gallery/group/:id", protectRoute, getGroupConversationGallery);
router.get("/gallery/:id", protectRoute, getDirectConversationGallery);
router.get("/search/group/:id", protectRoute, searchGroupMessages);
router.get("/search/:id", protectRoute, searchDirectMessages);
router.get("/attachments/:id/download", protectRoute, downloadMessageAttachment);
router.get("/group/:id", protectRoute, getGroupMessages);
router.get("/:id", protectRoute, getMessages);
router.post(
	"/send/group/:id",
	protectRoute,
	upload.fields([
		{ name: "audio", maxCount: 1 },
		{ name: "attachment", maxCount: 1 },
	]),
	sendGroupMessage
);
router.post(
	"/send/:id",
	protectRoute,
	upload.fields([
		{ name: "audio", maxCount: 1 },
		{ name: "attachment", maxCount: 1 },
	]),
	sendMessage
);
router.post("/seen/group/:id", protectRoute, markGroupConversationAsSeen);
router.post("/seen/:id", protectRoute, markMessagesAsSeen);
router.post("/:id/reactions", protectRoute, toggleMessageReaction);
router.post("/:id/save", protectRoute, toggleSavedMessage);
router.post("/:id/pin", protectRoute, togglePinnedMessage);
router.patch("/:id", protectRoute, editMessage);
router.delete("/conversation/group/:id", protectRoute, deleteGroupConversation);
router.delete("/conversation/:id", protectRoute, deleteConversation);
router.delete("/:id", protectRoute, deleteMessage);

export default router;
