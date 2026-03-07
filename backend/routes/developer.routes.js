import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import requireDeveloper from "../middleware/requireDeveloper.js";
import {
	deleteDeveloperMessage,
	deleteDeveloperUser,
	getDeveloperMessages,
	getDeveloperOverview,
	getDeveloperUsers,
	updateDeveloperUserArchive,
	updateDeveloperUserBan,
	updateDeveloperUserRole,
	updateDeveloperUserVerification,
} from "../controllers/developer.controller.js";

const router = express.Router();

router.use(protectRoute, requireDeveloper);

router.get("/overview", getDeveloperOverview);
router.get("/users", getDeveloperUsers);
router.get("/messages", getDeveloperMessages);
router.patch("/users/:id/role", updateDeveloperUserRole);
router.patch("/users/:id/verify", updateDeveloperUserVerification);
router.patch("/users/:id/archive", updateDeveloperUserArchive);
router.patch("/users/:id/ban", updateDeveloperUserBan);
router.delete("/users/:id", deleteDeveloperUser);
router.delete("/messages/:id", deleteDeveloperMessage);

export default router;
