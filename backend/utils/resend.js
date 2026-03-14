import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

const buildEmailConfigurationError = () => {
	const missingKeys = [];
	if (!resendApiKey) missingKeys.push("RESEND_API_KEY");
	if (!resendFromEmail) missingKeys.push("RESEND_FROM_EMAIL");

	const error = new Error(
		missingKeys.length
			? `Email delivery is not configured. Missing: ${missingKeys.join(", ")}`
			: "Email delivery is not configured on the server"
	);
	error.statusCode = 503;
	return error;
};

const ensureEmailDeliveryIsConfigured = () => {
	if (!resend || !resendFromEmail) {
		throw buildEmailConfigurationError();
	}
};

const sendTransactionalEmail = async ({ to, subject, html, text }) => {
	ensureEmailDeliveryIsConfigured();

	const response = await resend.emails.send({
		from: resendFromEmail,
		to,
		subject,
		html,
		text,
	});

	if (response?.error) {
		const error = new Error(response.error.message || "Unable to send email");
		error.statusCode = 502;
		throw error;
	}

	return response?.data || null;
};

export { buildEmailConfigurationError, ensureEmailDeliveryIsConfigured, sendTransactionalEmail };
