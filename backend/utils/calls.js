import { prisma } from "../db/prisma.js";
import { DIRECT_CONVERSATION_STATUSES, findDirectConversationByUsers } from "./conversations.js";
import { buildCallMessage } from "./systemMessages.js";
import { toMessageDto, toUserDto } from "./formatters.js";

export const CALL_MEDIA_TYPES = {
	VOICE: "VOICE",
	VIDEO: "VIDEO",
};

export const CALL_STATUSES = {
	RINGING: "RINGING",
	ACTIVE: "ACTIVE",
	ENDED: "ENDED",
};

export const CALL_PARTICIPANT_STATUSES = {
	INVITED: "INVITED",
	JOINED: "JOINED",
	DECLINED: "DECLINED",
	MISSED: "MISSED",
};

const userSelect = {
	id: true,
	fullName: true,
	username: true,
	role: true,
	isPrimaryDeveloper: true,
	isVerified: true,
	verifiedAt: true,
	profilePic: true,
	gender: true,
	bio: true,
	lastSeen: true,
	createdAt: true,
	updatedAt: true,
};

const conversationSelect = {
	id: true,
	type: true,
	title: true,
	description: true,
	profilePic: true,
	isPrivate: true,
	userOneId: true,
	userTwoId: true,
	userOne: {
		select: userSelect,
	},
	userTwo: {
		select: userSelect,
	},
	members: {
		select: {
			userId: true,
			user: {
				select: userSelect,
			},
		},
		orderBy: {
			joinedAt: "asc",
		},
	},
};

const messageInclude = {
	sender: {
		select: userSelect,
	},
	conversation: {
		select: {
			type: true,
		},
	},
	repliedMessage: {
		include: {
			sender: {
				select: userSelect,
			},
			conversation: {
				select: {
					type: true,
				},
			},
		},
	},
};

const callSessionInclude = {
	createdBy: {
		select: userSelect,
	},
	endedBy: {
		select: userSelect,
	},
	conversation: {
		select: conversationSelect,
	},
	participants: {
		include: {
			user: {
				select: userSelect,
			},
			invitedBy: {
				select: userSelect,
			},
		},
		orderBy: {
			invitedAt: "asc",
		},
	},
};

const normalizeMediaType = (mediaType) =>
	typeof mediaType === "string" && mediaType.trim().toUpperCase() === CALL_MEDIA_TYPES.VIDEO
		? CALL_MEDIA_TYPES.VIDEO
		: CALL_MEDIA_TYPES.VOICE;

const isParticipantActive = (participant) =>
	participant?.status === CALL_PARTICIPANT_STATUSES.JOINED && !participant?.leftAt;

const getDurationSeconds = (callSession) => {
	if (!callSession?.endedAt) return 0;

	const startTime = callSession.connectedAt || callSession.startedAt;
	const durationMs = new Date(callSession.endedAt).getTime() - new Date(startTime).getTime();
	return Math.max(0, Math.round(durationMs / 1000));
};

const formatDurationLabel = (totalSeconds) => {
	const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const seconds = safeSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const getJoinedParticipants = (callSession) =>
	callSession?.participants?.filter((participant) => participant.joinedAt) || [];

const getActiveParticipants = (callSession) =>
	callSession?.participants?.filter((participant) => isParticipantActive(participant)) || [];

const getInviteCount = (callSession) =>
	callSession?.participants?.filter((participant) => participant.status === CALL_PARTICIPANT_STATUSES.INVITED).length || 0;

const resolveCallMode = (callSession) =>
	callSession?.conversation?.type === "GROUP" || (callSession?.participants?.length || 0) > 2 ? "group" : "direct";

const getOtherUsers = (callSession, viewerId) =>
	(callSession?.participants || [])
		.map((participant) => participant.user)
		.filter((user) => user?.id && user.id !== viewerId);

const buildTitleAndAvatar = (callSession, viewerId) => {
	const otherUsers = getOtherUsers(callSession, viewerId);

	if (callSession?.conversation?.type === "GROUP") {
		return {
			title: callSession.conversation.title || "Group call",
			profilePic: callSession.conversation.profilePic || "",
		};
	}

	if (otherUsers.length === 1) {
		return {
			title: otherUsers[0].fullName,
			profilePic: otherUsers[0].profilePic || "",
		};
	}

	if (otherUsers.length > 1) {
		const [firstUser, secondUser] = otherUsers;
		const remainingCount = otherUsers.length - 2;
		return {
			title:
				remainingCount > 0
					? `${firstUser.fullName}, ${secondUser.fullName} +${remainingCount}`
					: `${firstUser.fullName}, ${secondUser.fullName}`,
			profilePic: firstUser.profilePic || "",
		};
	}

	return {
		title: callSession?.createdBy?.fullName || "Call",
		profilePic: callSession?.createdBy?.profilePic || "",
	};
};

const getPreviewText = (callSession) => {
	const mediaLabel = callSession.mediaType === CALL_MEDIA_TYPES.VIDEO ? "Video call" : "Voice call";
	const joinedCount = getJoinedParticipants(callSession).length;
	const durationSeconds = getDurationSeconds(callSession);

	if (callSession.status === CALL_STATUSES.ENDED) {
		return durationSeconds > 0
			? `${mediaLabel} · ${formatDurationLabel(durationSeconds)}`
			: `${mediaLabel} ended`;
	}

	if (callSession.status === CALL_STATUSES.ACTIVE) {
		return joinedCount > 1 ? `${mediaLabel} live · ${joinedCount} joined` : `${mediaLabel} live`;
	}

	return `${callSession.createdBy?.fullName || "Someone"} is calling`;
};

const buildCallMessagePayload = (callSession) => {
	const joinedCount = getJoinedParticipants(callSession).length;
	const activeCount = getActiveParticipants(callSession).length;
	const invitedCount = getInviteCount(callSession);
	const { title } = buildTitleAndAvatar(callSession, callSession.createdById);

	return {
		callId: callSession.id,
		status: callSession.status,
		mediaType: callSession.mediaType === CALL_MEDIA_TYPES.VIDEO ? "video" : "voice",
		callMode: resolveCallMode(callSession),
		conversationId: callSession.conversationId || null,
		title,
		initiatorId: callSession.createdById || null,
		initiatorName: callSession.createdBy?.fullName || "Someone",
		startedAt: callSession.startedAt?.toISOString?.() || callSession.startedAt,
		connectedAt: callSession.connectedAt?.toISOString?.() || callSession.connectedAt || null,
		endedAt: callSession.endedAt?.toISOString?.() || callSession.endedAt || null,
		durationSeconds: getDurationSeconds(callSession),
		participantCount: callSession.participants.length,
		joinedParticipantCount: joinedCount,
		activeParticipantCount: activeCount,
		invitedCount,
		previewText: getPreviewText(callSession),
	};
};

const getConversationAudienceUserIds = (callSession) => {
	if (!callSession?.conversation) {
		return callSession?.participants?.map((participant) => participant.userId) || [];
	}

	if (callSession.conversation.type === "GROUP") {
		return callSession.conversation.members.map((member) => member.userId);
	}

	return [callSession.conversation.userOneId, callSession.conversation.userTwoId].filter(Boolean);
};

const mapParticipantDto = (participant) => ({
	_id: participant.id,
	userId: participant.userId,
	status: participant.status,
	invitedAt: participant.invitedAt,
	joinedAt: participant.joinedAt,
	leftAt: participant.leftAt,
	isActive: isParticipantActive(participant),
	user: toUserDto(participant.user),
	invitedBy: participant.invitedBy ? toUserDto(participant.invitedBy) : null,
});

export const formatCallSessionForUser = (callSession, viewerId) => {
	if (!callSession) return null;

	const currentParticipant = callSession.participants.find((participant) => participant.userId === viewerId) || null;
	const joinedParticipants = getJoinedParticipants(callSession);
	const activeParticipants = getActiveParticipants(callSession);
	const { title, profilePic } = buildTitleAndAvatar(callSession, viewerId);
	const otherUsers = getOtherUsers(callSession, viewerId).map((user) => toUserDto(user));
	const conversationType =
		callSession.conversation?.type || ((callSession.participants?.length || 0) > 2 ? "GROUP" : "DIRECT");
	const callMode = resolveCallMode(callSession);

	return {
		_id: callSession.id,
		callId: callSession.id,
		callMessageId: callSession.callMessageId || null,
		conversationId: callSession.conversationId || null,
		conversationType,
		callMode,
		mediaType: callSession.mediaType === CALL_MEDIA_TYPES.VIDEO ? "video" : "voice",
		status: callSession.status,
		title,
		profilePic,
		startedAt: callSession.startedAt,
		connectedAt: callSession.connectedAt,
		endedAt: callSession.endedAt,
		durationSeconds: getDurationSeconds(callSession),
		participantCount: callSession.participants.length,
		joinedParticipantCount: joinedParticipants.length,
		activeParticipantCount: activeParticipants.length,
		invitedCount: getInviteCount(callSession),
		previewText: getPreviewText(callSession),
		initiator: callSession.createdBy ? toUserDto(callSession.createdBy) : null,
		endedBy: callSession.endedBy ? toUserDto(callSession.endedBy) : null,
		currentUserStatus: currentParticipant?.status || null,
		isCurrentUserActive: isParticipantActive(currentParticipant),
		canJoin:
			callSession.status !== CALL_STATUSES.ENDED &&
			Boolean(currentParticipant) &&
			currentParticipant.status !== CALL_PARTICIPANT_STATUSES.DECLINED &&
			!isParticipantActive(currentParticipant),
		canInvite: callSession.status !== CALL_STATUSES.ENDED && isParticipantActive(currentParticipant),
		participants: callSession.participants.map(mapParticipantDto),
		otherUsers,
		conversation: callSession.conversation
			? {
					_id: callSession.conversation.id,
					type: callSession.conversation.type,
					fullName: callSession.conversation.title || title,
					profilePic: callSession.conversation.profilePic || profilePic,
					isPrivate: Boolean(callSession.conversation.isPrivate),
					memberCount:
						callSession.conversation.type === "GROUP"
							? callSession.conversation.members.length
							: 2,
			  }
			: null,
	};
};

const getCallSessionById = (callId) =>
	prisma.callSession.findUnique({
		where: { id: callId },
		include: callSessionInclude,
	});

export const getCallSessionForUser = async (callId, viewerId) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession?.participants.some((participant) => participant.userId === viewerId)) {
		return null;
	}

	return callSession;
};

export const getCallDirectoryForUser = async (viewerId) => {
	const callSessions = await prisma.callSession.findMany({
		where: {
			participants: {
				some: {
					userId: viewerId,
				},
			},
		},
		orderBy: [{ updatedAt: "desc" }, { startedAt: "desc" }],
		include: callSessionInclude,
	});

	return callSessions.map((callSession) => formatCallSessionForUser(callSession, viewerId));
};

const resolveConversationForStart = async ({ userId, conversationId, targetUserId }) => {
	if (conversationId) {
		const conversation = await prisma.conversation.findFirst({
			where: {
				id: conversationId,
				OR: [
					{
						type: "GROUP",
						members: {
							some: {
								userId,
							},
						},
					},
					{
						type: "DIRECT",
						OR: [{ userOneId: userId }, { userTwoId: userId }],
					},
				],
			},
			select: conversationSelect,
		});

		if (conversation) {
			return conversation;
		}
	}

	if (!targetUserId || targetUserId === userId) {
		return null;
	}

	const targetUser = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: {
			id: true,
			isArchived: true,
			isBanned: true,
		},
	});

	if (!targetUser || targetUser.isArchived || targetUser.isBanned) {
		return null;
	}

	const directConversation = await findDirectConversationByUsers(userId, targetUserId);
	if (!directConversation || directConversation.directStatus !== DIRECT_CONVERSATION_STATUSES.ACCEPTED) {
		return null;
	}

	return prisma.conversation.findUnique({
		where: { id: directConversation.id },
		select: conversationSelect,
	});
};

const getInitialInviteeIds = (conversation, userId) => {
	if (!conversation) return [];

	if (conversation.type === "GROUP") {
		return conversation.members.map((member) => member.userId).filter((memberId) => memberId !== userId);
	}

	return [conversation.userOneId, conversation.userTwoId].filter(
		(participantId) => participantId && participantId !== userId
	);
};

const getDirectReceiverId = (conversation, senderId) => {
	if (conversation?.type !== "DIRECT") return null;
	return conversation.userOneId === senderId ? conversation.userTwoId : conversation.userOneId;
};

export const refreshCallMessageSnapshot = async (callId) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession) {
		return { callSession: null, formattedMessage: null };
	}

	if (!callSession.callMessageId) {
		return { callSession, formattedMessage: null };
	}

	const nextPayload = buildCallMessagePayload(callSession);
	const message = await prisma.message.update({
		where: { id: callSession.callMessageId },
		data: {
			message: buildCallMessage(nextPayload),
		},
		include: messageInclude,
	});

	return {
		callSession,
		formattedMessage: toMessageDto(message),
	};
};

export const createCallSessionRecord = async ({ userId, conversationId, targetUserId, mediaType, callId }) => {
	const normalizedMediaType = normalizeMediaType(mediaType);
	const conversation = await resolveConversationForStart({
		userId,
		conversationId,
		targetUserId,
	});

	if (!conversation) {
		return null;
	}

	const inviteeIds = getInitialInviteeIds(conversation, userId);
	if (inviteeIds.length === 0) {
		return null;
	}

	const now = new Date();
	const createdSession = await prisma.callSession.create({
		data: {
			...(callId ? { id: callId } : {}),
			conversationId: conversation.id,
			createdById: userId,
			mediaType: normalizedMediaType,
			status: CALL_STATUSES.RINGING,
			participants: {
				create: [
					{
						userId,
						status: CALL_PARTICIPANT_STATUSES.JOINED,
						joinedAt: now,
					},
					...inviteeIds.map((inviteeId) => ({
						userId: inviteeId,
						invitedById: userId,
						status: CALL_PARTICIPANT_STATUSES.INVITED,
					})),
				],
			},
		},
		include: callSessionInclude,
	});

	const callMessage = await prisma.message.create({
		data: {
			conversationId: conversation.id,
			senderId: userId,
			receiverId: getDirectReceiverId(conversation, userId),
			message: buildCallMessage(buildCallMessagePayload(createdSession)),
		},
		include: messageInclude,
	});

	await prisma.callSession.update({
		where: { id: createdSession.id },
		data: {
			callMessageId: callMessage.id,
		},
	});
	const callSession = {
		...createdSession,
		callMessageId: callMessage.id,
	};
	const formattedMessage = toMessageDto(callMessage);

	return {
		callSession,
		formattedMessage,
		audienceUserIds: getConversationAudienceUserIds(callSession),
		invitedUserIds: inviteeIds,
	};
};

export const joinCallSessionRecord = async ({ callId, userId }) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession || callSession.status === CALL_STATUSES.ENDED) {
		return null;
	}

	const participant = callSession.participants.find((entry) => entry.userId === userId);
	if (!participant || participant.status === CALL_PARTICIPANT_STATUSES.DECLINED || participant.status === CALL_PARTICIPANT_STATUSES.MISSED) {
		return null;
	}

	const nextJoinedAt = participant.joinedAt || new Date();
	await prisma.callParticipant.update({
		where: {
			callSessionId_userId: {
				callSessionId: callId,
				userId,
			},
		},
		data: {
			status: CALL_PARTICIPANT_STATUSES.JOINED,
			joinedAt: nextJoinedAt,
			leftAt: null,
		},
	});

	const activeParticipantCount = callSession.participants.filter(
		(entry) => entry.userId !== userId && isParticipantActive(entry)
	).length;
	if (callSession.status !== CALL_STATUSES.ACTIVE && activeParticipantCount >= 1) {
		await prisma.callSession.update({
			where: { id: callId },
			data: {
				status: CALL_STATUSES.ACTIVE,
				connectedAt: callSession.connectedAt || new Date(),
			},
		});
	}

	const refreshed = await refreshCallMessageSnapshot(callId);
	return {
		callSession: refreshed.callSession,
		formattedMessage: refreshed.formattedMessage,
		audienceUserIds: getConversationAudienceUserIds(refreshed.callSession),
		activeUserIds: getActiveParticipants(refreshed.callSession).map((entry) => entry.userId),
	};
};

export const declineCallSessionRecord = async ({ callId, userId }) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession || callSession.status === CALL_STATUSES.ENDED) {
		return null;
	}

	const participant = callSession.participants.find((entry) => entry.userId === userId);
	if (!participant || isParticipantActive(participant)) {
		return null;
	}

	await prisma.callParticipant.update({
		where: {
			callSessionId_userId: {
				callSessionId: callId,
				userId,
			},
		},
		data: {
			status: CALL_PARTICIPANT_STATUSES.DECLINED,
			leftAt: new Date(),
		},
	});

	const refreshed = await refreshCallMessageSnapshot(callId);
	return {
		callSession: refreshed.callSession,
		formattedMessage: refreshed.formattedMessage,
		audienceUserIds: getConversationAudienceUserIds(refreshed.callSession),
	};
};

const updateInvitedParticipant = async (callId, userId, inviterId) =>
	prisma.callParticipant.update({
		where: {
			callSessionId_userId: {
				callSessionId: callId,
				userId,
			},
		},
		data: {
			status: CALL_PARTICIPANT_STATUSES.INVITED,
			invitedById: inviterId,
			leftAt: null,
		},
	});

export const inviteUsersToCallSessionRecord = async ({ callId, inviterId, userIds }) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession || callSession.status === CALL_STATUSES.ENDED) {
		return null;
	}

	const inviterParticipant = callSession.participants.find((participant) => participant.userId === inviterId);
	if (!isParticipantActive(inviterParticipant)) {
		return null;
	}

	const normalizedUserIds = [...new Set((userIds || []).filter((userId) => typeof userId === "string" && userId && userId !== inviterId))];
	if (normalizedUserIds.length === 0) {
		return null;
	}

	const availableUsers = await prisma.user.findMany({
		where: {
			id: {
				in: normalizedUserIds,
			},
			isArchived: false,
			isBanned: false,
		},
		select: {
			id: true,
		},
	});

	const availableIds = new Set(availableUsers.map((user) => user.id));
	const invitedIds = [];

	for (const invitedUserId of normalizedUserIds) {
		if (!availableIds.has(invitedUserId)) {
			continue;
		}

		const existingParticipant = callSession.participants.find((participant) => participant.userId === invitedUserId);
		if (existingParticipant) {
			if (isParticipantActive(existingParticipant) || existingParticipant.status === CALL_PARTICIPANT_STATUSES.INVITED) {
				continue;
			}

			await updateInvitedParticipant(callId, invitedUserId, inviterId);
			invitedIds.push(invitedUserId);
			continue;
		}

		await prisma.callParticipant.create({
			data: {
				callSessionId: callId,
				userId: invitedUserId,
				invitedById: inviterId,
				status: CALL_PARTICIPANT_STATUSES.INVITED,
			},
		});
		invitedIds.push(invitedUserId);
	}

	if (invitedIds.length === 0) {
		const refreshedSession = await getCallSessionById(callId);
		return {
			callSession: refreshedSession,
			formattedMessage: null,
			audienceUserIds: getConversationAudienceUserIds(refreshedSession),
			invitedUserIds: [],
		};
	}

	const refreshed = await refreshCallMessageSnapshot(callId);
	return {
		callSession: refreshed.callSession,
		formattedMessage: refreshed.formattedMessage,
		audienceUserIds: getConversationAudienceUserIds(refreshed.callSession),
		invitedUserIds: invitedIds,
	};
};

export const leaveCallSessionRecord = async ({ callId, userId }) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession || callSession.status === CALL_STATUSES.ENDED) {
		return null;
	}

	const participant = callSession.participants.find((entry) => entry.userId === userId);
	if (!participant || !participant.joinedAt) {
		return null;
	}

	if (callSession.createdById === userId) {
		return endCallSessionRecord({ callId, endedById: userId });
	}

	await prisma.callParticipant.update({
		where: {
			callSessionId_userId: {
				callSessionId: callId,
				userId,
			},
		},
		data: {
			leftAt: new Date(),
		},
	});

	const sessionAfterLeave = await getCallSessionById(callId);
	const activeParticipantsAfterLeave = getActiveParticipants(sessionAfterLeave);
	// Calls are valid only while at least two joined participants are still active.
	if (sessionAfterLeave?.status === CALL_STATUSES.ACTIVE && activeParticipantsAfterLeave.length < 2) {
		return endCallSessionRecord({ callId, endedById: userId });
	}

	const refreshed = await refreshCallMessageSnapshot(callId);
	return {
		callSession: refreshed.callSession,
		formattedMessage: refreshed.formattedMessage,
		audienceUserIds: getConversationAudienceUserIds(refreshed.callSession),
	};
};

export const endCallSessionRecord = async ({ callId, endedById }) => {
	const callSession = await getCallSessionById(callId);
	if (!callSession) {
		return null;
	}

	if (callSession.status !== CALL_STATUSES.ENDED) {
		await prisma.$transaction([
			prisma.callSession.update({
				where: { id: callId },
				data: {
					status: CALL_STATUSES.ENDED,
					endedAt: callSession.endedAt || new Date(),
					endedById: endedById || callSession.endedById || null,
				},
			}),
			...callSession.participants.map((participant) =>
				prisma.callParticipant.update({
					where: {
						callSessionId_userId: {
							callSessionId: callId,
							userId: participant.userId,
						},
					},
					data: {
						status:
							participant.joinedAt || participant.status === CALL_PARTICIPANT_STATUSES.DECLINED
								? participant.status
								: CALL_PARTICIPANT_STATUSES.MISSED,
						leftAt: participant.leftAt || (participant.joinedAt ? new Date() : participant.leftAt),
					},
				})
			),
		]);
	}

	const refreshed = await refreshCallMessageSnapshot(callId);
	return {
		callSession: refreshed.callSession,
		formattedMessage: refreshed.formattedMessage,
		audienceUserIds: getConversationAudienceUserIds(refreshed.callSession),
	};
};

export const getActiveJoinedCallSessionsForUser = async (userId) =>
	prisma.callSession.findMany({
		where: {
			status: {
				in: [CALL_STATUSES.RINGING, CALL_STATUSES.ACTIVE],
			},
			participants: {
				some: {
					userId,
					status: CALL_PARTICIPANT_STATUSES.JOINED,
					leftAt: null,
				},
			},
		},
		include: callSessionInclude,
	});

export const getActiveCallUserIds = (callSession) =>
	getActiveParticipants(callSession).map((participant) => participant.userId);

export const getInvitedCallUserIds = (callSession) =>
	callSession?.participants
		.filter((participant) => participant.status === CALL_PARTICIPANT_STATUSES.INVITED)
		.map((participant) => participant.userId) || [];
