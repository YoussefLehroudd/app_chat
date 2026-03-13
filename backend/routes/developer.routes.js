import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireDeveloper from "../middleware/requireDeveloper.js";
import { avatarUpload } from "../utils/cloudinary.js";
import {
	deleteDeveloperGroup,
	deleteDeveloperGroupMessage,
	deleteDeveloperUser,
	getDeveloperGroupDetails,
	getDeveloperGroups,
	getDeveloperOverview,
	getDeveloperUsers,
	updateDeveloperUserData,
	updateDeveloperUserArchive,
	updateDeveloperUserBan,
	updateDeveloperUserPermissions,
	updateDeveloperUserRole,
	updateDeveloperUserVerification,
} from "../controllers/developer.controller.js";
import {
	addDeveloperGroupMembers,
	createDeveloperReport,
	deleteDeveloperReport,
	getDeveloperAuditLogs,
	getDeveloperReports,
	removeDeveloperGroupMember,
	updateDeveloperGroupMemberRole,
	updateDeveloperGroupSettings,
	updateDeveloperReport,
} from "../controllers/developerWorkspace.controller.js";

const router = express.Router();

router.use(protectRoute, requireDeveloper);

router.get("/overview", getDeveloperOverview);
router.get("/users", getDeveloperUsers);
router.get("/groups", getDeveloperGroups);
router.get("/reports", getDeveloperReports);
router.get("/audit-logs", getDeveloperAuditLogs);
router.get("/groups/:id", getDeveloperGroupDetails);
router.post("/reports", createDeveloperReport);
router.patch("/reports/:id", updateDeveloperReport);
router.patch("/groups/:id", updateDeveloperGroupSettings);
router.post("/groups/:id/members", addDeveloperGroupMembers);
router.patch("/groups/:id/members/:memberId/role", updateDeveloperGroupMemberRole);
router.patch("/users/:id/role", updateDeveloperUserRole);
router.patch("/users/:id/profile", avatarUpload.single("profilePic"), updateDeveloperUserData);
router.patch("/users/:id/permissions", updateDeveloperUserPermissions);
router.patch("/users/:id/verify", updateDeveloperUserVerification);
router.patch("/users/:id/archive", updateDeveloperUserArchive);
router.patch("/users/:id/ban", updateDeveloperUserBan);
router.delete("/groups/:id/members/:memberId", removeDeveloperGroupMember);
router.delete("/groups/:id/messages/:messageId", deleteDeveloperGroupMessage);
router.delete("/groups/:id", deleteDeveloperGroup);
router.delete("/reports/:id", deleteDeveloperReport);
router.delete("/users/:id", deleteDeveloperUser);

export default router;
