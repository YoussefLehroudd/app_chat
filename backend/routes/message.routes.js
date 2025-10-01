import express from "express";
import { getMessages, sendMessage, markMessagesAsSeen } from "../controllers/message.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.post("/seen/:id", protectRoute, markMessagesAsSeen);

export default router;
