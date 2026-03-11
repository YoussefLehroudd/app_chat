import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { storyUpload } from "../utils/cloudinary.js";
import {
	commentOnStory,
	createStory,
	deleteStory,
	getStoriesFeed,
	getStoryViewers,
	markStoryAsSeen,
	reactToStory,
} from "../controllers/story.controller.js";

const router = express.Router();
const handleStoryUpload = (req, res, next) => {
	storyUpload.single("storyMedia")(req, res, (error) => {
		if (!error) {
			next();
			return;
		}

		return res.status(400).json({ error: error.message || "Failed to process story media" });
	});
};

router.get("/", protectRoute, getStoriesFeed);
router.post("/", protectRoute, handleStoryUpload, createStory);
router.post("/:id/seen", protectRoute, markStoryAsSeen);
router.post("/:id/react", protectRoute, reactToStory);
router.post("/:id/comment", protectRoute, commentOnStory);
router.get("/:id/viewers", protectRoute, getStoryViewers);
router.delete("/:id", protectRoute, deleteStory);

export default router;
