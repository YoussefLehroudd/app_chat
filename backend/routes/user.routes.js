import express from "express";
import protectRoute from "../middleware/protectRoute.js";
import { getSelectableUsers, updateProfile } from "../controllers/user.controller.js";
import { avatarUpload } from "../utils/cloudinary.js";

const router = express.Router();

router.get("/", protectRoute, getSelectableUsers);
router.get("/selectable", protectRoute, getSelectableUsers);
router.put("/profile", protectRoute, avatarUpload.single("profilePic"), updateProfile);

export default router;
