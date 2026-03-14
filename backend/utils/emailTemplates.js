const APP_NAME = "ChatApp";
const APP_TAGLINE = "Realtime conversations with polished account recovery.";

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

const renderCtaButton = ({ label, url, accent }) => {
	if (!label || !url) return "";

	return `
		<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 26px 0 0;">
			<tr>
				<td align="center" bgcolor="${accent}" style="border-radius: 999px;">
					<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="display: inline-block; padding: 14px 24px; border-radius: 999px; color: #08111f; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-decoration: none;">
						${escapeHtml(label)}
					</a>
				</td>
			</tr>
		</table>
	`;
};

const renderEmailShell = ({
	preheader,
	eyebrow,
	title,
	lead,
	bodyHtml,
	ctaLabel,
	ctaUrl,
	accent = "#67e8f9",
	footnote,
}) => `
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${escapeHtml(title)}</title>
	</head>
	<body style="margin: 0; padding: 0; background-color: #050b16; font-family: Arial, Helvetica, sans-serif; color: #d6e2f3;">
		<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
			${escapeHtml(preheader)}
		</div>
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #050b16;">
			<tr>
				<td align="center" style="padding: 28px 16px;">
					<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 640px;">
						<tr>
							<td style="padding-bottom: 16px; text-align: center; color: #7dd3fc; font-size: 12px; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 700;">
								${escapeHtml(APP_NAME)}
							</td>
						</tr>
						<tr>
							<td style="border-radius: 28px; background: linear-gradient(180deg, #071120 0%, #0c1830 100%); border: 1px solid rgba(148, 163, 184, 0.16); overflow: hidden;">
								<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
									<tr>
										<td style="height: 4px; background: linear-gradient(90deg, #38bdf8 0%, ${accent} 60%, #f59e0b 100%);"></td>
									</tr>
									<tr>
										<td style="padding: 34px 32px 30px;">
											<div style="display: inline-block; padding: 9px 14px; border-radius: 999px; border: 1px solid rgba(103, 232, 249, 0.18); background: rgba(14, 165, 233, 0.12); color: #bae6fd; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; font-weight: 700;">
												${escapeHtml(eyebrow)}
											</div>
											<h1 style="margin: 18px 0 0; color: #f8fbff; font-size: 34px; line-height: 1.12; font-weight: 700;">
												${escapeHtml(title)}
											</h1>
											<p style="margin: 14px 0 0; color: #d5e0ef; font-size: 16px; line-height: 1.8;">
												${escapeHtml(lead)}
											</p>
											<div style="margin-top: 22px; color: #a9b8cb; font-size: 15px; line-height: 1.85;">
												${bodyHtml}
											</div>
											${renderCtaButton({ label: ctaLabel, url: ctaUrl, accent })}
										</td>
									</tr>
									<tr>
										<td style="padding: 0 32px 30px;">
											<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-radius: 22px; background: rgba(15, 23, 42, 0.68); border: 1px solid rgba(148, 163, 184, 0.1);">
												<tr>
													<td style="padding: 18px 20px;">
														<p style="margin: 0; color: #f8fafc; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;">
															${escapeHtml(APP_TAGLINE)}
														</p>
														<p style="margin: 10px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.7;">
															${escapeHtml(
																footnote ||
																	"If you did not request this message, you can safely ignore it. No changes will be made unless you use the recovery action above."
															)}
														</p>
													</td>
												</tr>
											</table>
										</td>
									</tr>
								</table>
							</td>
						</tr>
						<tr>
							<td style="padding: 18px 20px 0; text-align: center; color: #64748b; font-size: 12px; line-height: 1.8;">
								${escapeHtml(APP_NAME)} account recovery email
							</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>
`;

const buildPasswordResetEmail = ({ fullName, resetUrl }) => {
	const safeName = escapeHtml(fullName || "there");
	const html = renderEmailShell({
		preheader: "Reset your ChatApp password.",
		eyebrow: "Password reset",
		title: "Secure your account in one step",
		lead: `Hi ${safeName}, we received a request to reset your ${APP_NAME} password.`,
		bodyHtml: `
			<p style="margin: 0;">Tap the button below to create a new password. This secure link expires in 20 minutes.</p>
		`,
		ctaLabel: "Reset password",
		ctaUrl: resetUrl,
		accent: "#67e8f9",
	});

	const text = [
		`Hi ${fullName || "there"},`,
		"",
		`We received a request to reset your ${APP_NAME} password.`,
		"Use the link below within 20 minutes:",
		resetUrl,
		"",
		"If you did not request this, you can ignore this email.",
	].join("\n");

	return {
		subject: "Reset your ChatApp password",
		html,
		text,
	};
};

const buildUsernameReminderEmail = ({ fullName, username, loginUrl }) => {
	const safeName = escapeHtml(fullName || "there");
	const safeUsername = escapeHtml(username);
	const safeLoginUrl = escapeHtml(loginUrl);
	const html = renderEmailShell({
		preheader: "Your ChatApp username reminder.",
		eyebrow: "Username reminder",
		title: "Here is your ChatApp username",
		lead: `Hi ${safeName}, you asked us to remind you of the username linked to this email.`,
		bodyHtml: `
			<p style="margin: 0 0 14px;">Your username is:</p>
			<div style="display: inline-block; padding: 16px 18px; border-radius: 20px; background: rgba(14, 165, 233, 0.12); border: 1px solid rgba(125, 211, 252, 0.18); color: #f8fbff; font-size: 22px; font-weight: 700; letter-spacing: 0.06em;">
				@${safeUsername}
			</div>
			<p style="margin: 18px 0 0;">You can use this username to log in to your account.</p>
		`,
		ctaLabel: "Open login",
		ctaUrl: loginUrl,
		accent: "#fbbf24",
	});

	const text = [
		`Hi ${fullName || "there"},`,
		"",
		"You asked for your ChatApp username reminder.",
		`Your username is: @${username}`,
		"",
		`Login here: ${loginUrl}`,
	].join("\n");

	return {
		subject: "Your ChatApp username reminder",
		html,
		text,
	};
};

const buildEmailVerificationEmail = ({ fullName, verificationUrl }) => {
	const safeName = escapeHtml(fullName || "there");
	const html = renderEmailShell({
		preheader: "Verify your ChatApp email address.",
		eyebrow: "Email verification",
		title: "Confirm your recovery email",
		lead: `Hi ${safeName}, confirm this email address to unlock password recovery and stronger account security.`,
		bodyHtml: `
			<p style="margin: 0;">Use the button below to verify your email. This secure link expires in 24 hours.</p>
		`,
		ctaLabel: "Verify email",
		ctaUrl: verificationUrl,
		accent: "#38bdf8",
	});

	const text = [
		`Hi ${fullName || "there"},`,
		"",
		`Verify your ${APP_NAME} email address with the link below within 24 hours:`,
		verificationUrl,
	].join("\n");

	return {
		subject: "Verify your ChatApp email",
		html,
		text,
	};
};

export { buildEmailVerificationEmail, buildPasswordResetEmail, buildUsernameReminderEmail };
