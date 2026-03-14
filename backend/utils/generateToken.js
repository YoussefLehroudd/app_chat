import jwt from "jsonwebtoken";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS, SESSION_DURATION_SECONDS } from "./authSecurity.js";

const generateTokenAndSetCookie = (userId, sessionId, res) => {
	const token = jwt.sign({ userId, sessionId }, process.env.JWT_SECRET, {
		expiresIn: SESSION_DURATION_SECONDS,
	});

	res.cookie(SESSION_COOKIE_NAME, token, {
		maxAge: SESSION_DURATION_MS,
		httpOnly: true, // prevent XSS attacks cross-site scripting attacks
		sameSite: "strict", // CSRF attacks cross-site request forgery attacks
		secure: process.env.NODE_ENV !== "development",
	});
};

export default generateTokenAndSetCookie;
