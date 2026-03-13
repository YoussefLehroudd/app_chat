import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { MAX_STORY_UPLOAD_BYTES, MAX_STORY_VIDEO_DURATION_SECONDS, storyUpload } from "../utils/cloudinary.js";
import {
	commentOnStory,
	createStory,
	deleteStory,
	getStoriesFeed,
	getStoryViewers,
	markStoryAsSeen,
	reactToStory,
	returnCachedStoryUploadIfAvailable,
} from "../controllers/story.controller.js";

const router = express.Router();
const STORY_UPLOAD_SIZE_MB = Math.round(MAX_STORY_UPLOAD_BYTES / (1024 * 1024));
const handleStoryUpload = (req, res, next) => {
	storyUpload.single("storyMedia")(req, res, (error) => {
		if (!error) {
			next();
			return;
		}

		if (error.code === "LIMIT_FILE_SIZE") {
			return res.status(400).json({
				error: `Story media is too large. Videos support up to ${STORY_UPLOAD_SIZE_MB} MB before trimming.`,
			});
		}

		if (typeof error.message === "string" && error.message.includes("File too large")) {
			return res.status(400).json({
				error: `Story media is too large. Videos support up to ${STORY_UPLOAD_SIZE_MB} MB before trimming.`,
			});
		}

		if (typeof error.message === "string" && error.message.toLowerCase().includes("video")) {
			return res.status(400).json({
				error: `Story videos are automatically limited to ${MAX_STORY_VIDEO_DURATION_SECONDS}s. Pick the clip you want and try again.`,
			});
		}

		return res.status(400).json({ error: error.message || "Failed to process story media" });
	});
};

router.get("/", protectRoute, getStoriesFeed);
router.post("/", protectRoute, returnCachedStoryUploadIfAvailable, handleStoryUpload, createStory);
router.post("/:id/seen", protectRoute, markStoryAsSeen);
router.post("/:id/react", protectRoute, reactToStory);
router.post("/:id/comment", protectRoute, commentOnStory);
router.get("/:id/viewers", protectRoute, getStoryViewers);
router.delete("/:id", protectRoute, deleteStory);

export default router;
