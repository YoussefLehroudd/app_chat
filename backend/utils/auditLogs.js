import { prisma } from "../db/prisma.js";

const normalizeSummary = (value) => {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, 500);
};

const normalizeLabel = (value) => {
	if (typeof value !== "string") return null;
	const trimmedValue = value.trim();
	return trimmedValue ? trimmedValue.slice(0, 250) : null;
};

const createAuditLog = async ({
	actorId,
	action,
	entityType,
	entityId = null,
	entityLabel = null,
	summary,
	details = null,
}) => {
	const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : "";
	const normalizedEntityType = typeof entityType === "string" ? entityType.trim().toUpperCase() : "";
	const normalizedSummary = normalizeSummary(summary);

	if (!normalizedAction || !normalizedEntityType || !normalizedSummary) {
		return null;
	}

	return prisma.auditLog.create({
		data: {
			actorId: actorId || null,
			action: normalizedAction,
			entityType: normalizedEntityType,
			entityId: entityId || null,
			entityLabel: normalizeLabel(entityLabel),
			summary: normalizedSummary,
			details: details ?? null,
		},
	});
};

export { createAuditLog };
