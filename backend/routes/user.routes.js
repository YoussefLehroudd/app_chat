import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { getUsersForSidebar, updateProfile } from "../controllers/user.controller.js";
import { avatarUpload } from "../utils/cloudinary.js";

const router = express.Router();

router.get("/", protectRoute, getUsersForSidebar);
router.put("/profile", protectRoute, avatarUpload.single("profilePic"), updateProfile);

export default router;
