import { prisma } from "../db/prisma.js";
import { createSessionTokenId, getRequestIpAddress, getRequestUserAgent } from "./authSecurity.js";

const createUserSessionRecord = ({ userId, req }) =>
	prisma.userSession.create({
		data: {
			userId,
			sessionTokenId: createSessionTokenId(),
			userAgent: getRequestUserAgent(req),
			ipAddress: getRequestIpAddress(req),
		},
	});

const getActiveUserSessionByTokenId = (sessionTokenId) => {
	if (!sessionTokenId) return null;

	return prisma.userSession.findFirst({
		where: {
			sessionTokenId,
			revokedAt: null,
		},
	});
};

const touchUserSession = async (sessionTokenId) => {
	if (!sessionTokenId) return null;

	const session = await prisma.userSession.findUnique({
		where: { sessionTokenId },
		select: { lastSeenAt: true },
	});

	if (!session?.lastSeenAt) return null;

	const minutesSinceLastSeen = Math.abs(Date.now() - new Date(session.lastSeenAt).getTime()) / (1000 * 60);
	if (minutesSinceLastSeen < 3) {
		return session;
	}

	return prisma.userSession.update({
		where: { sessionTokenId },
		data: { lastSeenAt: new Date() },
	});
};

const revokeUserSession = (sessionTokenId) => {
	if (!sessionTokenId) return null;

	return prisma.userSession.updateMany({
		where: {
			sessionTokenId,
			revokedAt: null,
		},
		data: {
			revokedAt: new Date(),
		},
	});
};

const revokeOtherUserSessions = (userId, currentSessionTokenId) =>
	prisma.userSession.updateMany({
		where: {
			userId,
			revokedAt: null,
			...(currentSessionTokenId
				? {
						sessionTokenId: {
							not: currentSessionTokenId,
						},
				  }
				: {}),
		},
		data: {
			revokedAt: new Date(),
		},
	});

const listActiveUserSessions = (userId) =>
	prisma.userSession.findMany({
		where: {
			userId,
			revokedAt: null,
		},
		orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
	});

export {
	createUserSessionRecord,
	getActiveUserSessionByTokenId,
	listActiveUserSessions,
	revokeOtherUserSessions,
	revokeUserSession,
	touchUserSession,
};
