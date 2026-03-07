import express from "express";
import {
	deleteConversation,
	deleteMessage,
	getMessages,
	markMessagesAsSeen,
	sendMessage,
} from "../controllers/message.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { upload } from "../utils/cloudinary.js";

const router = express.Router();

router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, upload.single("audio"), sendMessage);
router.post("/seen/:id", protectRoute, markMessagesAsSeen);
router.delete("/conversation/:id", protectRoute, deleteConversation);
router.delete("/:id", protectRoute, deleteMessage);

export default router;
