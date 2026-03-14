import crypto from "crypto";
import { hashRecoveryToken } from "./recoveryTokens.js";

const SESSION_COOKIE_NAME = "jwt";
const SESSION_DURATION_MS = 15 * 24 * 60 * 60 * 1000;
const SESSION_DURATION_SECONDS = Math.floor(SESSION_DURATION_MS / 1000);
const TWO_FACTOR_CODE_LENGTH = 6;

const createSessionTokenId = () => crypto.randomUUID();

const createVerificationToken = () => {
	const token = crypto.randomBytes(32).toString("hex");
	return {
		token,
		tokenHash: hashRecoveryToken(token),
	};
};

const createTwoFactorCode = () => {
	const maxValue = 10 ** TWO_FACTOR_CODE_LENGTH;
	const code = String(crypto.randomInt(0, maxValue)).padStart(TWO_FACTOR_CODE_LENGTH, "0");
	return {
		code,
		codeHash: hashRecoveryToken(code),
	};
};

const getRequestIpAddress = (req) => {
	const forwardedFor = req.get("x-forwarded-for");
	if (typeof forwardedFor === "string" && forwardedFor.trim()) {
		return forwardedFor.split(",")[0].trim().slice(0, 120);
	}

	const fallbackIp =
		req.ip ||
		req.socket?.remoteAddress ||
		req.connection?.remoteAddress ||
		"";

	return String(fallbackIp || "").trim().slice(0, 120) || null;
};

const getRequestUserAgent = (req) => {
	const rawUserAgent = typeof req.get === "function" ? req.get("user-agent") : "";
	return typeof rawUserAgent === "string" && rawUserAgent.trim()
		? rawUserAgent.trim().slice(0, 500)
		: null;
};

export {
	SESSION_COOKIE_NAME,
	SESSION_DURATION_MS,
	SESSION_DURATION_SECONDS,
	createSessionTokenId,
	createTwoFactorCode,
	createVerificationToken,
	getRequestIpAddress,
	getRequestUserAgent,
};
