import { prisma } from "../db/prisma.js";

export const CONVERSATION_TYPES = {
	DIRECT: "DIRECT",
	GROUP: "GROUP",
};

export const DIRECT_CONVERSATION_STATUSES = {
	PENDING: "PENDING",
	ACCEPTED: "ACCEPTED",
};

export const CONVERSATION_MEMBER_ROLES = {
	OWNER: "OWNER",
	ADMIN: "ADMIN",
	MEMBER: "MEMBER",
};

export const getConversationPair = (userAId, userBId) => {
	return userAId < userBId
		? { userOneId: userAId, userTwoId: userBId }
		: { userOneId: userBId, userTwoId: userAId };
};

export const findDirectConversationByUsers = async (userAId, userBId, options = {}) => {
	const { userOneId, userTwoId } = getConversationPair(userAId, userBId);
	return prisma.conversation.findUnique({
		where: {
			userOneId_userTwoId_type: {
				userOneId,
				userTwoId,
				type: CONVERSATION_TYPES.DIRECT,
			},
		},
		...options,
	});
};

export const findOrCreateDirectConversation = async (userAId, userBId) => {
	let conversation = await findDirectConversationByUsers(userAId, userBId);

	if (!conversation) {
		const { userOneId, userTwoId } = getConversationPair(userAId, userBId);
		conversation = await prisma.conversation.create({
			data: {
				type: CONVERSATION_TYPES.DIRECT,
				userOneId,
				userTwoId,
				directStatus: DIRECT_CONVERSATION_STATUSES.ACCEPTED,
			},
		});
	}

	return conversation;
};

export const getGroupConversationForMember = async (conversationId, userId, options = {}) =>
	prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: CONVERSATION_TYPES.GROUP,
			members: {
				some: { userId },
			},
		},
		...options,
	});
