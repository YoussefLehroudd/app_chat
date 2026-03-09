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

const imageFileFilter = (req, file, cb) => {
	if (!file.mimetype.startsWith("image/")) {
		return cb(new Error("Only image files are allowed"), false);
	}
	cb(null, true);
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
export { cloudinary };
