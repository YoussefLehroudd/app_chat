import express from "express";
import { getMessages, sendMessage, markMessagesAsSeen, deleteMessage } from "../controllers/message.controller.js";
import protectRoute from "../middleware/protectRoute.js";
import { upload } from "../utils/cloudinary.js";

const router = express.Router();

router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", upload.single('audio'), protectRoute, sendMessage);
router.post("/seen/:id", protectRoute, markMessagesAsSeen);
router.delete("/:id", protectRoute, deleteMessage);

export default router;
