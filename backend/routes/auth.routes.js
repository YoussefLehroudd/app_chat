import express from "express";
import {
	checkUsernameAvailability,
	createTwoFactorSetupSession,
	disableTwoFactor,
	forgotPassword,
	forgotUsername,
	getCurrentUser,
	getSessionUser,
	login,
	logout,
	resetPassword,
	sendEmailVerification,
	signup,
	verifyEmail,
	verifyTwoFactorSetup,
} from "../controllers/auth.controller.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/check-username", checkUsernameAvailability);
router.post("/signup", signup);

router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/forgot-username", forgotUsername);
router.post("/reset-password", resetPassword);
router.post("/verify-email", verifyEmail);

router.post("/logout", logout);
router.get("/session", getSessionUser);
router.get("/me", protectRoute, getCurrentUser);
router.post("/send-verification-email", protectRoute, sendEmailVerification);
router.post("/2fa/setup", protectRoute, createTwoFactorSetupSession);
router.post("/2fa/verify", protectRoute, verifyTwoFactorSetup);
router.delete("/2fa", protectRoute, disableTwoFactor);

export default router;
