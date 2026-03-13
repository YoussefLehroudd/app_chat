import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const MAX_STORY_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_STORY_VIDEO_DURATION_SECONDS = 30;

const storage = new CloudinaryStorage({
	cloudinary,
	params: {
		folder: "chat_audios",
		resource_type: "video",
	},
});

const avatarStorage = new CloudinaryStorage({
	cloudinary,
	params: {
		folder: "chat_avatars",
		resource_type: "image",
	},
});

const resolveMessageUploadParams = (file) => {
	const mimeType = file?.mimetype || "";

	if (file?.fieldname === "audio" || mimeType.startsWith("audio/")) {
		return {
			folder: "chat_audios",
			resource_type: "video",
		};
	}

	if (mimeType.startsWith("image/")) {
		return {
			folder: "chat_attachments/images",
			resource_type: "image",
		};
	}

	if (mimeType.startsWith("video/")) {
		return {
			folder: "chat_attachments/videos",
			resource_type: "video",
		};
	}

	return {
		folder: "chat_attachments/files",
		resource_type: "raw",
	};
};

const messageStorage = new CloudinaryStorage({
	cloudinary,
	params: async (req, file) => resolveMessageUploadParams(file),
});

const parseStoryClipSeconds = (value, fallback = 0) => {
	const parsedValue = Number(value);
	if (!Number.isFinite(parsedValue) || parsedValue < 0) {
		return fallback;
	}

	return Math.round(parsedValue * 1000) / 1000;
};

const resolveStoryUploadParams = async (req, file) => {
	const mimeType = file?.mimetype || "";

	if (mimeType.startsWith("image/")) {
		return {
			folder: "chat_stories/images",
			resource_type: "image",
			transformation: [
				{
					quality: "auto:good",
					width: 1440,
					height: 2560,
					crop: "limit",
				},
			],
		};
	}

	const clipStartSeconds = parseStoryClipSeconds(req.body?.clipStartSeconds, 0);
	const requestedClipDurationSeconds = parseStoryClipSeconds(
		req.body?.clipDurationSeconds,
		MAX_STORY_VIDEO_DURATION_SECONDS
	);
	const clipDurationSeconds = Math.min(
		Math.max(requestedClipDurationSeconds, 1),
		MAX_STORY_VIDEO_DURATION_SECONDS
	);

	return {
		folder: "chat_stories/videos",
		resource_type: "video",
		format: "mp4",
		transformation: [
			{
				start_offset: clipStartSeconds,
				duration: clipDurationSeconds,
			},
			{
				quality: "auto:good",
				width: 1080,
				height: 1920,
				crop: "limit",
			},
		],
	};
};

const storyStorage = new CloudinaryStorage({
	cloudinary,
	params: async (req, file) => resolveStoryUploadParams(req, file),
});

const imageFileFilter = (req, file, cb) => {
	if (!file.mimetype.startsWith("image/")) {
		return cb(new Error("Only image files are allowed"), false);
	}
	cb(null, true);
};

const storyFileFilter = (req, file, cb) => {
	const mimeType = file?.mimetype || "";
	if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
		return cb(null, true);
	}

	return cb(new Error("Only image or video files are allowed"), false);
};

export const upload = multer({
	storage: messageStorage,
	limits: { fileSize: 25 * 1024 * 1024 },
});
export const avatarUpload = multer({
	storage: avatarStorage,
	fileFilter: imageFileFilter,
	limits: { fileSize: 5 * 1024 * 1024 },
});
export const storyUpload = multer({
	storage: storyStorage,
	fileFilter: storyFileFilter,
	limits: { fileSize: MAX_STORY_UPLOAD_BYTES },
});
export { cloudinary };
