import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { avatarUpload } from "../utils/cloudinary.js";
import {
	addGroupMembers,
	createGroupConversation,
	deleteGroupConversationPermanently,
	getSidebarConversations,
	joinPublicGroupConversation,
	leaveGroupConversation,
	removeGroupMember,
	respondToGroupInvitation,
	sendGroupInvitation,
	updateGroupMemberRole,
	updateGroupConversation,
} from "../controllers/conversation.controller.js";

const router = express.Router();

router.get("/", protectRoute, getSidebarConversations);
router.post("/groups", protectRoute, avatarUpload.single("profilePic"), createGroupConversation);
router.patch("/groups/:id", protectRoute, avatarUpload.single("profilePic"), updateGroupConversation);
router.post("/groups/:id/join", protectRoute, joinPublicGroupConversation);
router.post("/groups/:id/members", protectRoute, addGroupMembers);
router.post("/groups/:id/invitations", protectRoute, sendGroupInvitation);
router.patch("/groups/:id/members/:memberId/role", protectRoute, updateGroupMemberRole);
router.delete("/groups/:id/members/:memberId", protectRoute, removeGroupMember);
router.post("/groups/:id/leave", protectRoute, leaveGroupConversation);
router.delete("/groups/:id", protectRoute, deleteGroupConversationPermanently);
router.post("/group-invites/:messageId/respond", protectRoute, respondToGroupInvitation);

export default router;
