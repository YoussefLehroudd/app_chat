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
	createDeveloperModerationRule,
	deleteDeveloperReport,
	deleteDeveloperModerationRule,
	getDeveloperAuditLogs,
	getDeveloperModerationCenter,
	getDeveloperReports,
	removeDeveloperGroupMember,
	updateDeveloperGroupMemberRole,
	updateDeveloperGroupSettings,
	updateDeveloperModerationRule,
	updateDeveloperReport,
} from "../controllers/developerWorkspace.controller.js";
import {
	addDeveloperSupportTicketMessage,
	createDeveloperBroadcast,
	createDeveloperFeatureFlag,
	createDeveloperSupportTicket,
	createDeveloperVerificationRequest,
	getDeveloperAnalytics,
	getDeveloperBroadcasts,
	getDeveloperFeatureFlags,
	getDeveloperSecurityOverview,
	getDeveloperSupportTickets,
	getDeveloperUserInsights,
	getDeveloperVerificationRequests,
	updateDeveloperFeatureFlag,
	updateDeveloperSupportTicket,
	updateDeveloperVerificationRequest,
} from "../controllers/developerAdmin.controller.js";

const router = express.Router();

router.use(protectRoute, requireDeveloper);

router.get("/overview", getDeveloperOverview);
router.get("/users", getDeveloperUsers);
router.get("/groups", getDeveloperGroups);
router.get("/analytics", getDeveloperAnalytics);
router.get("/reports", getDeveloperReports);
router.get("/moderation-center", getDeveloperModerationCenter);
router.get("/audit-logs", getDeveloperAuditLogs);
router.get("/support-tickets", getDeveloperSupportTickets);
router.get("/verification-requests", getDeveloperVerificationRequests);
router.get("/security", getDeveloperSecurityOverview);
router.get("/broadcasts", getDeveloperBroadcasts);
router.get("/feature-flags", getDeveloperFeatureFlags);
router.get("/groups/:id", getDeveloperGroupDetails);
router.get("/users/:id/insights", getDeveloperUserInsights);
router.post("/reports", createDeveloperReport);
router.post("/moderation-rules", createDeveloperModerationRule);
router.post("/support-tickets", createDeveloperSupportTicket);
router.post("/support-tickets/:id/messages", addDeveloperSupportTicketMessage);
router.post("/verification-requests", createDeveloperVerificationRequest);
router.post("/broadcasts", createDeveloperBroadcast);
router.post("/feature-flags", createDeveloperFeatureFlag);
router.patch("/reports/:id", updateDeveloperReport);
router.patch("/moderation-rules/:id", updateDeveloperModerationRule);
router.patch("/support-tickets/:id", updateDeveloperSupportTicket);
router.patch("/verification-requests/:id", updateDeveloperVerificationRequest);
router.patch("/feature-flags/:id", updateDeveloperFeatureFlag);
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
router.delete("/moderation-rules/:id", deleteDeveloperModerationRule);
router.delete("/users/:id", deleteDeveloperUser);

export default router;
