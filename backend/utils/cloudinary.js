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

const imageFileFilter = (req, file, cb) => {
	if (!file.mimetype.startsWith("image/")) {
		return cb(new Error("Only image files are allowed"), false);
	}
	cb(null, true);
};

export const upload = multer({ storage });
export const avatarUpload = multer({
	storage: avatarStorage,
	fileFilter: imageFileFilter,
	limits: { fileSize: 5 * 1024 * 1024 },
});
export { cloudinary };
