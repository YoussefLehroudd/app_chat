import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { avatarUpload } from "../utils/cloudinary.js";
import {
	addGroupMembers,
	createGroupConversation,
	deleteGroupConversationPermanently,
	getDirectInvitations,
	getSidebarConversations,
	joinPublicGroupConversation,
	leaveGroupConversation,
	removeGroupMember,
	respondToDirectInvitation,
	respondToGroupInvitation,
	sendDirectInvitation,
	sendGroupInvitation,
	updateConversationDisappearingMessages,
	updateConversationPreferences,
	updateGroupMemberRole,
	updateGroupConversation,
} from "../controllers/conversation.controller.js";

const router = express.Router();

router.get("/", protectRoute, getSidebarConversations);
router.get("/direct-invitations", protectRoute, getDirectInvitations);
router.post("/direct-invitations", protectRoute, sendDirectInvitation);
router.post("/direct-invitations/:id/respond", protectRoute, respondToDirectInvitation);
router.patch("/:id/preferences", protectRoute, updateConversationPreferences);
router.patch("/:id/disappearing", protectRoute, updateConversationDisappearingMessages);
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
