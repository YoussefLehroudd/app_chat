import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import {
	blockUser,
	getBlockedUsers,
	getSelectableUsers,
	getUserSessions,
	revokeOtherSessions,
	revokeSessionByTokenId,
	unblockUser,
	updatePrivacySettings,
	updateProfile,
} from "../controllers/user.controller.js";
import { avatarUpload } from "../utils/cloudinary.js";

const router = express.Router();

router.get("/", protectRoute, getSelectableUsers);
router.get("/selectable", protectRoute, getSelectableUsers);
router.get("/sessions", protectRoute, getUserSessions);
router.get("/blocked", protectRoute, getBlockedUsers);
router.put("/profile", protectRoute, avatarUpload.single("profilePic"), updateProfile);
router.patch("/privacy", protectRoute, updatePrivacySettings);
router.delete("/sessions/others", protectRoute, revokeOtherSessions);
router.delete("/sessions/:sessionTokenId", protectRoute, revokeSessionByTokenId);
router.post("/block/:userId", protectRoute, blockUser);
router.delete("/block/:userId", protectRoute, unblockUser);

export default router;
