import { prisma } from "../db/prisma.js";

const normalizeDisappearingSeconds = (value) => {
	if (value === null || value === undefined || value === "" || value === "off") {
		return null;
	}

	const parsedValue = Number.parseInt(value, 10);
	if (!Number.isFinite(parsedValue) || parsedValue <= 0) return Number.NaN;

	const allowedValues = new Set([300, 3600, 86400, 604800]);
	return allowedValues.has(parsedValue) ? parsedValue : Number.NaN;
};

const getBlockStatus = async (currentUserId, otherUserId) => {
	if (!currentUserId || !otherUserId) {
		return {
			isBlocked: false,
			blockedByCurrentUser: false,
			blockedByOtherUser: false,
		};
	}

	const [blockedByCurrentUser, blockedByOtherUser] = await Promise.all([
		prisma.userBlock.findUnique({
			where: {
				blockerId_blockedUserId: {
					blockerId: currentUserId,
					blockedUserId: otherUserId,
				},
			},
			select: { blockerId: true },
		}),
		prisma.userBlock.findUnique({
			where: {
				blockerId_blockedUserId: {
					blockerId: otherUserId,
					blockedUserId: currentUserId,
				},
			},
			select: { blockerId: true },
		}),
	]);

	return {
		isBlocked: Boolean(blockedByCurrentUser || blockedByOtherUser),
		blockedByCurrentUser: Boolean(blockedByCurrentUser),
		blockedByOtherUser: Boolean(blockedByOtherUser),
	};
};

const upsertConversationPreference = ({ conversationId, userId, data }) =>
	prisma.conversationPreference.upsert({
		where: {
			conversationId_userId: {
				conversationId,
				userId,
			},
		},
		update: data,
		create: {
			conversationId,
			userId,
			...data,
		},
	});

export { getBlockStatus, normalizeDisappearingSeconds, upsertConversationPreference };
