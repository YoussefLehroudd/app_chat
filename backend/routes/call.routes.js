import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import {
	declineCall,
	endCall,
	getCallById,
	getCallDirectory,
	inviteUsersToCall,
	joinCall,
	leaveCall,
	startCall,
} from "../controllers/call.controller.js";

const router = express.Router();

router.get("/", protectRoute, getCallDirectory);
router.get("/:id", protectRoute, getCallById);
router.post("/start", protectRoute, startCall);
router.post("/:id/join", protectRoute, joinCall);
router.post("/:id/decline", protectRoute, declineCall);
router.post("/:id/invite", protectRoute, inviteUsersToCall);
router.post("/:id/leave", protectRoute, leaveCall);
router.post("/:id/end", protectRoute, endCall);

export default router;
