export const SYSTEM_MESSAGE_PREFIX = "__CHAT_SYSTEM__:";
export const GROUP_INVITE_MESSAGE_PREFIX = "__CHAT_GROUP_INVITE__:";
export const CALL_MESSAGE_PREFIX = "__CHAT_CALL__:";
export const STORY_INTERACTION_MESSAGE_PREFIX = "__CHAT_STORY_INTERACTION__:";

export const GROUP_SYSTEM_MESSAGE_TYPES = {
	MEMBER_LEFT: "MEMBER_LEFT",
	OWNER_LEFT: "OWNER_LEFT",
	MEMBER_REMOVED: "MEMBER_REMOVED",
	MEMBER_JOINED_BY_INVITE: "MEMBER_JOINED_BY_INVITE",
	GROUP_ANNOUNCEMENT: "GROUP_ANNOUNCEMENT",
	GROUP_POLL_CREATED: "GROUP_POLL_CREATED",
	GROUP_EVENT_CREATED: "GROUP_EVENT_CREATED",
};

export const GROUP_INVITE_STATUSES = {
	PENDING: "PENDING",
	ACCEPTED: "ACCEPTED",
	DECLINED: "DECLINED",
};

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");
const truncateText = (value, maxLength = 180) => {
	const normalizedValue = normalizeText(value).replace(/\s+/g, " ");
	if (normalizedValue.length <= maxLength) {
		return normalizedValue;
	}

	return `${normalizedValue.slice(0, Math.max(maxLength - 3, 0)).trimEnd()}...`;
};
const normalizeIsoDate = (value) => {
	if (!value) return null;
	const normalizedDate = new Date(value);
	return Number.isFinite(normalizedDate.getTime()) ? normalizedDate.toISOString() : null;
};

const normalizePollOptions = (options) =>
	Array.isArray(options)
		? options
				.map((option, index) => {
					const label = normalizeText(option?.label);
					const id = typeof option?.id === "string" ? option.id : "";
					if (!label || !id) {
						return null;
					}

					const voterIds = Array.isArray(option?.voterIds)
						? [...new Set(option.voterIds.filter((voterId) => typeof voterId === "string" && voterId.trim()))]
						: [];

					return {
						id,
						label,
						position: Number.isFinite(option?.position) ? option.position : index,
						voterIds,
					};
				})
				.filter(Boolean)
				.sort((leftOption, rightOption) => leftOption.position - rightOption.position)
		: [];

const buildSystemMessageContent = (payload) => `${SYSTEM_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
const buildGroupInviteMessageContent = (payload) => `${GROUP_INVITE_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
const buildCallMessageContent = (payload) => `${CALL_MESSAGE_PREFIX}${JSON.stringify(payload)}`;
const buildStoryInteractionMessageContent = (payload) =>
	`${STORY_INTERACTION_MESSAGE_PREFIX}${JSON.stringify(payload)}`;

export const parseSystemMessageContent = (value) => {
	if (typeof value !== "string" || !value.startsWith(SYSTEM_MESSAGE_PREFIX)) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(value.slice(SYSTEM_MESSAGE_PREFIX.length));
		const type = typeof parsedValue?.type === "string" ? parsedValue.type : null;
		const text = normalizeText(parsedValue?.text);

		if (!type || !text) {
			return null;
		}

		return {
			type,
			text,
			previewText: normalizeText(parsedValue?.previewText) || text,
			actorName: normalizeText(parsedValue?.actorName),
			announcementId: typeof parsedValue?.announcementId === "string" ? parsedValue.announcementId : null,
			content: normalizeText(parsedValue?.content),
			eventId: typeof parsedValue?.eventId === "string" ? parsedValue.eventId : null,
			title: normalizeText(parsedValue?.title),
			description: normalizeText(parsedValue?.description),
			location: normalizeText(parsedValue?.location),
			startsAt: normalizeIsoDate(parsedValue?.startsAt),
			pollId: typeof parsedValue?.pollId === "string" ? parsedValue.pollId : null,
			question: normalizeText(parsedValue?.question),
			allowsMultiple: parsedValue?.allowsMultiple === true,
			closesAt: normalizeIsoDate(parsedValue?.closesAt),
			totalVotes: Number.isFinite(parsedValue?.totalVotes) ? parsedValue.totalVotes : 0,
			options: normalizePollOptions(parsedValue?.options),
		};
	} catch {
		return null;
	}
};

export const parseCallMessageContent = (value) => {
	if (typeof value !== "string" || !value.startsWith(CALL_MESSAGE_PREFIX)) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(value.slice(CALL_MESSAGE_PREFIX.length));
		const callId = typeof parsedValue?.callId === "string" ? parsedValue.callId : null;
		const status = typeof parsedValue?.status === "string" ? parsedValue.status : null;
		const mediaType = typeof parsedValue?.mediaType === "string" ? parsedValue.mediaType : "voice";
		const previewText = normalizeText(parsedValue?.previewText);

		if (!callId || !status) {
			return null;
		}

		return {
			type: "CALL",
			callId,
			status,
			mediaType,
			callMode: typeof parsedValue?.callMode === "string" ? parsedValue.callMode : "direct",
			conversationId: typeof parsedValue?.conversationId === "string" ? parsedValue.conversationId : null,
			title: normalizeText(parsedValue?.title),
			initiatorId: typeof parsedValue?.initiatorId === "string" ? parsedValue.initiatorId : null,
			initiatorName: normalizeText(parsedValue?.initiatorName) || "Someone",
			startedAt: typeof parsedValue?.startedAt === "string" ? parsedValue.startedAt : null,
			connectedAt: typeof parsedValue?.connectedAt === "string" ? parsedValue.connectedAt : null,
			endedAt: typeof parsedValue?.endedAt === "string" ? parsedValue.endedAt : null,
			durationSeconds: Number.isFinite(parsedValue?.durationSeconds) ? parsedValue.durationSeconds : 0,
			participantCount: Number.isFinite(parsedValue?.participantCount) ? parsedValue.participantCount : 0,
			joinedParticipantCount: Number.isFinite(parsedValue?.joinedParticipantCount)
				? parsedValue.joinedParticipantCount
				: 0,
			activeParticipantCount: Number.isFinite(parsedValue?.activeParticipantCount)
				? parsedValue.activeParticipantCount
				: 0,
			invitedCount: Number.isFinite(parsedValue?.invitedCount) ? parsedValue.invitedCount : 0,
			previewText: previewText || "Call",
		};
	} catch {
		return null;
	}
};

export const parseStoryInteractionMessageContent = (value) => {
	if (typeof value !== "string" || !value.startsWith(STORY_INTERACTION_MESSAGE_PREFIX)) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(value.slice(STORY_INTERACTION_MESSAGE_PREFIX.length));
		const storyId = typeof parsedValue?.storyId === "string" ? parsedValue.storyId : null;
		const storyOwnerId = typeof parsedValue?.storyOwnerId === "string" ? parsedValue.storyOwnerId : null;
		const interactionType =
			typeof parsedValue?.interactionType === "string" ? parsedValue.interactionType.toUpperCase() : null;
		const previewText = normalizeText(parsedValue?.previewText);

		if (!storyId || !storyOwnerId || !["REACTION", "COMMENT"].includes(interactionType)) {
			return null;
		}

		return {
			type: "STORY_INTERACTION",
			storyId,
			storyOwnerId,
			storyOwnerName: normalizeText(parsedValue?.storyOwnerName),
			storyMediaType: typeof parsedValue?.storyMediaType === "string" ? parsedValue.storyMediaType : "TEXT",
			storyMediaUrl: normalizeText(parsedValue?.storyMediaUrl) || null,
			storyText: normalizeText(parsedValue?.storyText),
			interactionType,
			emoji: normalizeText(parsedValue?.emoji),
			comment: normalizeText(parsedValue?.comment),
			previewText: previewText || (interactionType === "REACTION" ? "Reacted to your story" : "Replied to your story"),
		};
	} catch {
		return null;
	}
};

export const buildGroupMemberLeftSystemMessage = ({ isOwner = false, memberName }) =>
	buildSystemMessageContent({
		type: isOwner ? GROUP_SYSTEM_MESSAGE_TYPES.OWNER_LEFT : GROUP_SYSTEM_MESSAGE_TYPES.MEMBER_LEFT,
		text: isOwner ? "Owner left the group" : `${normalizeText(memberName) || "A member"} left the group`,
	});

export const buildGroupMemberRemovedSystemMessage = ({ actorName, targetName }) =>
	buildSystemMessageContent({
		type: GROUP_SYSTEM_MESSAGE_TYPES.MEMBER_REMOVED,
		text: `${normalizeText(actorName) || "A manager"} removed ${normalizeText(targetName) || "a member"}`,
	});

export const buildGroupMemberJoinedByInviteSystemMessage = ({ actorName, targetName }) =>
	buildSystemMessageContent({
		type: GROUP_SYSTEM_MESSAGE_TYPES.MEMBER_JOINED_BY_INVITE,
		text: `${normalizeText(actorName) || "A member"} invited ${normalizeText(targetName) || "a member"}`,
	});

export const buildGroupAnnouncementSystemMessage = ({ actorName, announcementId, content }) =>
	buildSystemMessageContent({
		type: GROUP_SYSTEM_MESSAGE_TYPES.GROUP_ANNOUNCEMENT,
		text: `${normalizeText(actorName) || "An admin"} posted an announcement`,
		previewText: `Announcement: ${truncateText(content, 84)}`,
		actorName: normalizeText(actorName) || "An admin",
		announcementId: typeof announcementId === "string" ? announcementId : null,
		content: normalizeText(content),
	});

export const buildGroupPollCreatedSystemMessage = ({
	actorName,
	pollId,
	question,
	allowsMultiple = false,
	closesAt = null,
	options = [],
}) =>
	buildSystemMessageContent({
		type: GROUP_SYSTEM_MESSAGE_TYPES.GROUP_POLL_CREATED,
		text: `${normalizeText(actorName) || "An admin"} created a poll`,
		previewText: `Poll: ${truncateText(question, 84)}`,
		actorName: normalizeText(actorName) || "An admin",
		pollId: typeof pollId === "string" ? pollId : null,
		question: normalizeText(question),
		allowsMultiple: allowsMultiple === true,
		closesAt: normalizeIsoDate(closesAt),
		totalVotes: normalizePollOptions(options).reduce((sum, option) => sum + option.voterIds.length, 0),
		options: normalizePollOptions(options),
	});

export const buildGroupEventCreatedSystemMessage = ({ actorName, eventId, title, description, startsAt, location }) => {
	return buildSystemMessageContent({
		type: GROUP_SYSTEM_MESSAGE_TYPES.GROUP_EVENT_CREATED,
		text: `${normalizeText(actorName) || "An admin"} scheduled an event`,
		previewText: `Event: ${truncateText(title, 84)}`,
		actorName: normalizeText(actorName) || "An admin",
		eventId: typeof eventId === "string" ? eventId : null,
		title: normalizeText(title),
		description: normalizeText(description),
		startsAt: normalizeIsoDate(startsAt),
		location: normalizeText(location),
	});
};

export const buildCallMessage = (payload) =>
	buildCallMessageContent({
		type: "CALL",
		callId: payload?.callId,
		status: payload?.status,
		mediaType: payload?.mediaType || "voice",
		callMode: payload?.callMode || "direct",
		conversationId: payload?.conversationId || null,
		title: normalizeText(payload?.title),
		initiatorId: payload?.initiatorId || null,
		initiatorName: normalizeText(payload?.initiatorName) || "Someone",
		startedAt: payload?.startedAt || null,
		connectedAt: payload?.connectedAt || null,
		endedAt: payload?.endedAt || null,
		durationSeconds: Number.isFinite(payload?.durationSeconds) ? payload.durationSeconds : 0,
		participantCount: Number.isFinite(payload?.participantCount) ? payload.participantCount : 0,
		joinedParticipantCount: Number.isFinite(payload?.joinedParticipantCount) ? payload.joinedParticipantCount : 0,
		activeParticipantCount: Number.isFinite(payload?.activeParticipantCount) ? payload.activeParticipantCount : 0,
		invitedCount: Number.isFinite(payload?.invitedCount) ? payload.invitedCount : 0,
		previewText: normalizeText(payload?.previewText) || "Call",
	});

export const buildStoryInteractionMessage = ({
	storyId,
	storyOwnerId,
	storyOwnerName,
	storyMediaType = "TEXT",
	storyMediaUrl,
	storyText,
	interactionType = "REACTION",
	emoji = "",
	comment = "",
	previewText,
}) =>
	buildStoryInteractionMessageContent({
		type: "STORY_INTERACTION",
		storyId,
		storyOwnerId,
		storyOwnerName: normalizeText(storyOwnerName),
		storyMediaType: typeof storyMediaType === "string" ? storyMediaType.toUpperCase() : "TEXT",
		storyMediaUrl: normalizeText(storyMediaUrl),
		storyText: normalizeText(storyText),
		interactionType: typeof interactionType === "string" ? interactionType.toUpperCase() : "REACTION",
		emoji: normalizeText(emoji),
		comment: normalizeText(comment),
		previewText: normalizeText(previewText),
	});

export const parseGroupInviteMessageContent = (value) => {
	if (typeof value !== "string" || !value.startsWith(GROUP_INVITE_MESSAGE_PREFIX)) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(value.slice(GROUP_INVITE_MESSAGE_PREFIX.length));
		const groupId = typeof parsedValue?.groupId === "string" ? parsedValue.groupId : null;
		const groupTitle = normalizeText(parsedValue?.groupTitle);
		const inviterId = typeof parsedValue?.inviterId === "string" ? parsedValue.inviterId : null;
		const inviterName = normalizeText(parsedValue?.inviterName);
		const status = typeof parsedValue?.status === "string" ? parsedValue.status.toUpperCase() : null;

		if (!groupId || !groupTitle || !inviterId || !inviterName || !Object.values(GROUP_INVITE_STATUSES).includes(status)) {
			return null;
		}

		return {
			type: "GROUP_INVITE",
			groupId,
			groupTitle,
			groupDescription: normalizeText(parsedValue?.groupDescription),
			groupProfilePic: normalizeText(parsedValue?.groupProfilePic),
			isPrivate: Boolean(parsedValue?.isPrivate),
			inviterId,
			inviterName,
			status,
		};
	} catch {
		return null;
	}
};

export const buildGroupInviteMessage = ({
	groupId,
	groupTitle,
	groupDescription,
	groupProfilePic,
	isPrivate = false,
	inviterId,
	inviterName,
	status = GROUP_INVITE_STATUSES.PENDING,
}) =>
	buildGroupInviteMessageContent({
		type: "GROUP_INVITE",
		groupId,
		groupTitle: normalizeText(groupTitle),
		groupDescription: normalizeText(groupDescription),
		groupProfilePic: normalizeText(groupProfilePic),
		isPrivate: Boolean(isPrivate),
		inviterId,
		inviterName: normalizeText(inviterName),
		status,
	});

export const updateGroupInviteMessageStatus = (value, status) => {
	const invitation = parseGroupInviteMessageContent(value);
	if (!invitation || !Object.values(GROUP_INVITE_STATUSES).includes(status)) {
		return value;
	}

	return buildGroupInviteMessage({
		...invitation,
		status,
	});
};
