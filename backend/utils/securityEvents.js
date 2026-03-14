import { prisma } from "../db/prisma.js";
import { getRequestIpAddress, getRequestUserAgent } from "./authSecurity.js";

const normalizeSummary = (value) => {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, 320);
};

const createSecurityEvent = async ({
	userId = null,
	eventType,
	riskLevel = "LOW",
	summary,
	ipAddress = null,
	userAgent = null,
	details = null,
}) => {
	const normalizedEventType = typeof eventType === "string" ? eventType.trim().toUpperCase() : "";
	const normalizedRiskLevel = typeof riskLevel === "string" ? riskLevel.trim().toUpperCase() : "LOW";
	const normalizedSummary = normalizeSummary(summary);

	if (!normalizedEventType || !normalizedSummary) {
		return null;
	}

	return prisma.securityEvent.create({
		data: {
			userId,
			eventType: normalizedEventType,
			riskLevel: normalizedRiskLevel,
			summary: normalizedSummary,
			ipAddress:
				typeof ipAddress === "string" && ipAddress.trim() ? ipAddress.trim().slice(0, 120) : null,
			userAgent:
				typeof userAgent === "string" && userAgent.trim() ? userAgent.trim().slice(0, 500) : null,
			details: details ?? null,
		},
	});
};

const createRequestSecurityEvent = ({ req, ...entry }) =>
	createSecurityEvent({
		...entry,
		ipAddress: entry.ipAddress ?? getRequestIpAddress(req),
		userAgent: entry.userAgent ?? getRequestUserAgent(req),
	});

export { createRequestSecurityEvent, createSecurityEvent };
