import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

const TWO_FACTOR_APP_NAME = "ChatApp";

const createTwoFactorSetup = async ({ email, username }) => {
	const secret = generateSecret();
	const label = email || username || "chat-user";
	const otpauthUrl = generateURI({
		issuer: TWO_FACTOR_APP_NAME,
		label,
		secret,
		strategy: "totp",
		period: 30,
		digits: 6,
	});
	const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
		margin: 1,
		width: 220,
	});

	return {
		secret,
		otpauthUrl,
		qrCodeDataUrl,
	};
};

const verifyTwoFactorCode = (secret, code) => {
	if (!secret || typeof code !== "string" || !code.trim()) return false;
	try {
		return verifySync({
			token: code.trim(),
			secret,
			strategy: "totp",
			period: 30,
			digits: 6,
			epochTolerance: 1,
		});
	} catch {
		return false;
	}
};

export { createTwoFactorSetup, verifyTwoFactorCode };
