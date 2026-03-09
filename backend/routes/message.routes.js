import express from "express";
import {
	deleteConversation,
	deleteGroupConversation,
	deleteMessage,
	downloadMessageAttachment,
	getGroupMessages,
	getMessages,
	markGroupConversationAsSeen,
	markMessagesAsSeen,
	sendMessage,
	sendGroupMessage,
} from "../controllers/message.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { upload } from "../utils/cloudinary.js";

const router = express.Router();

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
router.delete("/conversation/group/:id", protectRoute, deleteGroupConversation);
router.delete("/conversation/:id", protectRoute, deleteConversation);
router.delete("/:id", protectRoute, deleteMessage);

export default router;
