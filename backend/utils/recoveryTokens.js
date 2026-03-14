import crypto from "crypto";

const hashRecoveryToken = (token) =>
	crypto.createHash("sha256").update(String(token || "")).digest("hex");

const createRecoveryToken = ({ expiresInMinutes = 20 } = {}) => {
	const token = crypto.randomBytes(32).toString("hex");

	return {
		token,
		tokenHash: hashRecoveryToken(token),
		expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
	};
};

export { createRecoveryToken, hashRecoveryToken };
