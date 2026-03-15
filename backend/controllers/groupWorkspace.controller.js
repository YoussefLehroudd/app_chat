import crypto from "crypto";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { getUserSocketIds, io } from "../socket/socket.js";
import { toConversationItemDto, toMessageDto, toUserDto } from "../utils/formatters.js";
import {
	CONVERSATION_MEMBER_ROLES,
	CONVERSATION_TYPES,
	getGroupConversationForMember,
} from "../utils/conversations.js";
import {
	buildGroupAnnouncementSystemMessage,
	buildGroupEventCreatedSystemMessage,
	buildGroupPollCreatedSystemMessage,
	parseCallMessageContent,
	parseGroupInviteMessageContent,
	parseStoryInteractionMessageContent,
	parseSystemMessageContent,
} from "../utils/systemMessages.js";
import { deleteMessageEverywhere } from "../utils/messageModeration.js";

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

const buildVisibleMessageInclude = (viewerId) => ({
	where: {
		NOT: {
			deletedFor: {
				has: viewerId,
			},
		},
	},
	orderBy: { createdAt: "desc" },
	take: 1,
	select: {
		message: true,
		audio: true,
		attachmentType: true,
		attachmentFileName: true,
		createdAt: true,
	},
});

const buildConversationPreferenceInclude = (viewerId) => ({
	preferences: {
		where: {
			userId: viewerId,
		},
		take: 1,
		select: {
			isArchived: true,
			archivedAt: true,
			mutedUntil: true,
		},
	},
});

const groupConversationInclude = (viewerId) => ({
	members: {
		include: {
			user: {
				select: userSelect,
			},
		},
		orderBy: { joinedAt: "asc" },
	},
	...buildConversationPreferenceInclude(viewerId),
});

const groupSystemMessageInclude = {
	sender: {
		select: userSelect,
	},
	conversation: {
		select: {
			type: true,
		},
	},
};

const emitToUsers = (userIds, eventName, payload) => {
	[...new Set((userIds || []).filter(Boolean))].forEach((userId) => {
		getUserSocketIds(userId).forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const emitPublicGroupsChanged = () => {
	io.emit("publicGroupsChanged");
};

const emitGroupWorkspaceUpdated = (conversation, section = "workspace") => {
	if (!conversation?.id) return;

	emitToUsers(
		(conversation.members || []).map((member) => member.userId),
		"groupWorkspaceUpdated",
		{
			conversationId: conversation.id,
			section,
			updatedAt: new Date().toISOString(),
		}
	);
};

const emitPersonalizedWorkspaceMessageEvent = (userIds, eventName, messageRecord) => {
	[...new Set((userIds || []).filter(Boolean))].forEach((targetUserId) => {
		const payload = toMessageDto(messageRecord, { viewerId: targetUserId });
		getUserSocketIds(targetUserId).forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const emitGroupWorkspaceSystemMessage = async ({ conversationId, senderId, rawMessage, audienceUserIds }) => {
	const uniqueUserIds = [...new Set((audienceUserIds || []).filter(Boolean))];
	if (!conversationId || !senderId || !rawMessage || uniqueUserIds.length === 0) {
		return null;
	}

	const message = await prisma.message.create({
		data: {
			conversationId,
			senderId,
			receiverId: null,
			message: rawMessage,
		},
		include: groupSystemMessageInclude,
	});

	emitPersonalizedWorkspaceMessageEvent(uniqueUserIds, "newMessage", message);
	return message;
};

const getSystemMessageTypeLookupPattern = (type) => `"type":"${type}"`;
const getAnnouncementSystemMessageLookupPattern = (announcementId) => `"announcementId":"${announcementId}"`;
const getPollSystemMessageLookupPattern = (pollId) => `"pollId":"${pollId}"`;
const getEventSystemMessageLookupPattern = (eventId) => `"eventId":"${eventId}"`;

const findWorkspaceSystemMessageByMatcher = async ({
	conversationId,
	type,
	directLookupPattern = null,
	matcher,
}) => {
	if (!conversationId || !type || typeof matcher !== "function") {
		return null;
	}

	if (directLookupPattern) {
		const directMatch = await prisma.message.findFirst({
			where: {
				conversationId,
				message: {
					contains: directLookupPattern,
				},
			},
			orderBy: { createdAt: "desc" },
			include: groupSystemMessageInclude,
		});

		if (directMatch) {
			return directMatch;
		}
	}

	const candidateMessages = await prisma.message.findMany({
		where: {
			conversationId,
			message: {
				contains: getSystemMessageTypeLookupPattern(type),
			},
		},
		orderBy: { createdAt: "desc" },
		take: 24,
		include: groupSystemMessageInclude,
	});

	return (
		candidateMessages.find((candidateMessage) => {
			const parsedMessage = parseSystemMessageContent(candidateMessage.message);
			return parsedMessage?.type === type && matcher(parsedMessage, candidateMessage);
		}) || null
	);
};

const findAnnouncementSystemMessage = (conversationId, announcement) =>
	findWorkspaceSystemMessageByMatcher({
		conversationId,
		type: "GROUP_ANNOUNCEMENT",
		directLookupPattern: announcement?.id ? getAnnouncementSystemMessageLookupPattern(announcement.id) : null,
		matcher: (parsedMessage, candidateMessage) => {
			if (announcement?.id && parsedMessage.announcementId === announcement.id) {
				return true;
			}

			return (
				!parsedMessage.announcementId &&
				parsedMessage.content === announcement?.content &&
				candidateMessage.senderId === announcement?.createdById
			);
		},
	});

const findEventSystemMessage = (conversationId, event) =>
	findWorkspaceSystemMessageByMatcher({
		conversationId,
		type: "GROUP_EVENT_CREATED",
		directLookupPattern: event?.id ? getEventSystemMessageLookupPattern(event.id) : null,
		matcher: (parsedMessage, candidateMessage) =>
			(event?.id && parsedMessage.eventId === event.id) ||
			(!parsedMessage.eventId &&
				parsedMessage.title === event?.title &&
				candidateMessage.senderId === event?.createdById),
	});

const findPollSystemMessage = (conversationId, poll) =>
	findWorkspaceSystemMessageByMatcher({
		conversationId,
		type: "GROUP_POLL_CREATED",
		directLookupPattern: poll?.id ? getPollSystemMessageLookupPattern(poll.id) : null,
		matcher: (parsedMessage, candidateMessage) =>
			(poll?.id && parsedMessage.pollId === poll.id) ||
			(!parsedMessage.pollId &&
				parsedMessage.question === poll?.question &&
				candidateMessage.senderId === poll?.createdById),
	});

const toPollSystemMessageOptions = (poll) =>
	(poll?.options || [])
		.slice()
		.sort((leftOption, rightOption) => leftOption.position - rightOption.position)
		.map((option) => ({
			id: option.id,
			label: option.label,
			position: option.position,
			voterIds: (option.votes || []).map((vote) => vote.userId).filter(Boolean),
		}));

const updateGroupPollSystemMessage = async ({ conversation, poll }) => {
	if (!conversation?.id || !poll?.id) {
		return null;
	}

	const existingPollMessage = await findPollSystemMessage(conversation.id, poll);

	if (!existingPollMessage) {
		return null;
	}

	const refreshedMessage = await prisma.message.update({
		where: { id: existingPollMessage.id },
		data: {
			message: buildGroupPollCreatedSystemMessage({
				actorName: poll.createdBy?.fullName,
				pollId: poll.id,
				question: poll.question,
				allowsMultiple: poll.allowsMultiple,
				closesAt: poll.closesAt,
				options: toPollSystemMessageOptions(poll),
			}),
		},
		include: groupSystemMessageInclude,
	});

	emitPersonalizedWorkspaceMessageEvent(
		conversation.members.map((member) => member.userId),
		"messageUpdated",
		refreshedMessage
	);

	return refreshedMessage;
};

const updateGroupAnnouncementSystemMessage = async ({ conversation, announcement, existingMessageId = null }) => {
	if (!conversation?.id || !announcement?.id) {
		return null;
	}

	const existingAnnouncementMessage = existingMessageId
		? await prisma.message.findUnique({
				where: { id: existingMessageId },
				include: groupSystemMessageInclude,
		  })
		: await findAnnouncementSystemMessage(conversation.id, announcement);
	if (!existingAnnouncementMessage) {
		return null;
	}

	const refreshedMessage = await prisma.message.update({
		where: { id: existingAnnouncementMessage.id },
		data: {
			message: buildGroupAnnouncementSystemMessage({
				actorName: announcement.createdBy?.fullName,
				announcementId: announcement.id,
				content: announcement.content,
			}),
		},
		include: groupSystemMessageInclude,
	});

	emitPersonalizedWorkspaceMessageEvent(
		conversation.members.map((member) => member.userId),
		"messageUpdated",
		refreshedMessage
	);

	return refreshedMessage;
};

const updateGroupEventSystemMessage = async ({ conversation, event }) => {
	if (!conversation?.id || !event?.id) {
		return null;
	}

	const existingEventMessage = await findEventSystemMessage(conversation.id, event);
	if (!existingEventMessage) {
		return null;
	}

	const refreshedMessage = await prisma.message.update({
		where: { id: existingEventMessage.id },
		data: {
			message: buildGroupEventCreatedSystemMessage({
				actorName: event.createdBy?.fullName,
				eventId: event.id,
				title: event.title,
				description: event.description,
				startsAt: event.startsAt,
				location: event.location,
			}),
		},
		include: groupSystemMessageInclude,
	});

	emitPersonalizedWorkspaceMessageEvent(
		conversation.members.map((member) => member.userId),
		"messageUpdated",
		refreshedMessage
	);

	return refreshedMessage;
};

const getViewerPreference = (conversation) =>
	Array.isArray(conversation?.preferences) && conversation.preferences.length > 0
		? conversation.preferences[0]
		: null;

const getLatestMessagePreview = (latestMessage) => {
	if (!latestMessage) return null;
	if (latestMessage.audio) return "Audio message";
	if (latestMessage.attachmentType) {
		return (
			latestMessage.attachmentFileName?.trim() ||
			(latestMessage.attachmentType === "IMAGE"
				? "Photo"
				: latestMessage.attachmentType === "VIDEO"
					? "Video"
					: latestMessage.attachmentType === "PDF"
						? "PDF"
						: "File")
		);
	}

	const parsedSystemMessage = parseSystemMessageContent(latestMessage.message);
	if (parsedSystemMessage) {
		return parsedSystemMessage.previewText || parsedSystemMessage.text;
	}

	const parsedGroupInvite = parseGroupInviteMessageContent(latestMessage.message);
	if (parsedGroupInvite) {
		return "Group invitation";
	}

	const parsedCallMessage = parseCallMessageContent(latestMessage.message);
	if (parsedCallMessage) {
		return parsedCallMessage.previewText || "Call";
	}

	const parsedStoryInteraction = parseStoryInteractionMessageContent(latestMessage.message);
	if (parsedStoryInteraction) {
		return (
			parsedStoryInteraction.previewText ||
			(parsedStoryInteraction.interactionType === "REACTION"
				? "Reacted to your story"
				: "Replied to your story")
		);
	}

	return latestMessage.message?.trim() || "Message";
};

const buildGroupConversationItemForUser = async (conversationId, viewerId) => {
	const conversation = await prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: CONVERSATION_TYPES.GROUP,
			members: {
				some: { userId: viewerId },
			},
		},
		include: {
			...groupConversationInclude(viewerId),
			messages: buildVisibleMessageInclude(viewerId),
		},
	});

	if (!conversation) return null;

	const currentMember = conversation.members.find((member) => member.userId === viewerId);
	const unreadCount = await prisma.message.count({
		where: {
			conversationId: conversation.id,
			senderId: { not: viewerId },
			...(currentMember?.lastReadAt
				? {
						createdAt: {
							gt: currentMember.lastReadAt,
						},
				  }
				: {}),
			NOT: {
				deletedFor: {
					has: viewerId,
				},
			},
		},
	});

	const latestMessage = conversation.messages[0];
	const viewerPreference = getViewerPreference(conversation);

	return toConversationItemDto(
		{
			...conversation,
			lastMessage: getLatestMessagePreview(latestMessage),
			lastMessageAt: latestMessage?.createdAt ?? null,
			unreadCount,
			groupRole: currentMember?.role ?? null,
			isMember: Boolean(currentMember),
			isArchived: Boolean(viewerPreference?.isArchived),
			archivedAt: viewerPreference?.archivedAt ?? null,
			mutedUntil: viewerPreference?.mutedUntil ?? null,
		},
		viewerId
	);
};

const emitGroupConversationUpsert = async (conversationId, userIds) => {
	const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
	await Promise.all(
		uniqueUserIds.map(async (userId) => {
			const conversation = await buildGroupConversationItemForUser(conversationId, userId);
			if (!conversation) return;
			emitToUsers([userId], "conversationUpserted", conversation);
		})
	);
};

const isGroupManagerRole = (role) =>
	role === CONVERSATION_MEMBER_ROLES.OWNER || role === CONVERSATION_MEMBER_ROLES.ADMIN;

const isGroupModeratorRole = (role) =>
	isGroupManagerRole(role) || role === CONVERSATION_MEMBER_ROLES.MODERATOR;

const getAccessibleGroupConversation = (conversationId, userId) =>
	getGroupConversationForMember(conversationId, userId, {
		include: groupConversationInclude(userId),
	});

const getGroupConversationById = (conversationId) =>
	prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: CONVERSATION_TYPES.GROUP,
		},
		include: {
			members: {
				include: {
					user: {
						select: userSelect,
					},
				},
				orderBy: { joinedAt: "asc" },
			},
		},
	});

const requireGroupMember = (conversation, userId) => {
	const currentMember = conversation?.members?.find((member) => member.userId === userId);
	if (!conversation || !currentMember) {
		return { ok: false, status: 404, error: "Group not found" };
	}

	return { ok: true, currentMember };
};

const requireGroupModerator = (conversation, userId) => {
	const membership = requireGroupMember(conversation, userId);
	if (!membership.ok) return membership;
	if (!isGroupModeratorRole(membership.currentMember.role)) {
		return { ok: false, status: 403, error: "Only owners, admins, or moderators can perform this action" };
	}

	return membership;
};

const requireGroupManager = (conversation, userId) => {
	const membership = requireGroupMember(conversation, userId);
	if (!membership.ok) return membership;
	if (!isGroupManagerRole(membership.currentMember.role)) {
		return { ok: false, status: 403, error: "Only owners or admins can perform this action" };
	}

	return membership;
};

const parseSlowModeSeconds = (value) => {
	if (value === null || value === undefined || value === "" || value === "off" || Number(value) <= 0) {
		return null;
	}

	const parsedValue = Number.parseInt(value, 10);
	return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : Number.NaN;
};

const normalizePinnedRules = (value) => {
	const sourceRules = Array.isArray(value)
		? value
		: typeof value === "string"
			? value
					.split("\n")
					.map((rule) => rule.trim())
					.filter(Boolean)
			: [];

	return [...new Set(sourceRules.map((rule) => String(rule).trim()).filter(Boolean))].slice(0, 8);
};

const createInviteCode = () => crypto.randomBytes(12).toString("hex");

const extractInviteCode = (input) => {
	if (typeof input !== "string") return "";
	const trimmedInput = input.trim();
	if (!trimmedInput) return "";

	try {
		const parsedUrl = new URL(trimmedInput);
		const codeFromQuery = parsedUrl.searchParams.get("groupInvite");
		if (codeFromQuery) return codeFromQuery.trim();
		const lastSegment = parsedUrl.pathname.split("/").filter(Boolean).pop();
		return lastSegment ? lastSegment.trim() : "";
	} catch {
		return trimmedInput;
	}
};

const formatInviteLinks = (inviteLinks) =>
	(inviteLinks || []).map((inviteLink) => ({
		id: inviteLink.id,
		code: inviteLink.code,
		createdAt: inviteLink.createdAt,
		expiresAt: inviteLink.expiresAt ?? null,
		revokedAt: inviteLink.revokedAt ?? null,
		createdBy: inviteLink.createdBy ? toUserDto(inviteLink.createdBy) : null,
	}));

const formatJoinRequests = (joinRequests) =>
	(joinRequests || []).map((joinRequest) => ({
		id: joinRequest.id,
		status: joinRequest.status,
		message: joinRequest.message || "",
		createdAt: joinRequest.createdAt,
		updatedAt: joinRequest.updatedAt,
		respondedAt: joinRequest.respondedAt ?? null,
		requester: joinRequest.requester ? toUserDto(joinRequest.requester) : null,
		respondedBy: joinRequest.respondedBy ? toUserDto(joinRequest.respondedBy) : null,
		inviteLink: joinRequest.inviteLink
			? {
					id: joinRequest.inviteLink.id,
					code: joinRequest.inviteLink.code,
			  }
			: null,
	}));

const formatAnnouncements = (announcements) =>
	(announcements || []).map((announcement) => ({
		id: announcement.id,
		content: announcement.content,
		createdAt: announcement.createdAt,
		updatedAt: announcement.updatedAt,
		createdBy: announcement.createdBy ? toUserDto(announcement.createdBy) : null,
	}));

const formatEvents = (events) =>
	(events || []).map((event) => ({
		id: event.id,
		title: event.title,
		description: event.description || "",
		startsAt: event.startsAt,
		endsAt: event.endsAt ?? null,
		location: event.location || "",
		createdAt: event.createdAt,
		updatedAt: event.updatedAt,
		createdBy: event.createdBy ? toUserDto(event.createdBy) : null,
	}));

const formatPolls = (polls, viewerId) =>
	(polls || []).map((poll) => ({
		id: poll.id,
		question: poll.question,
		allowsMultiple: Boolean(poll.allowsMultiple),
		closesAt: poll.closesAt ?? null,
		createdAt: poll.createdAt,
		updatedAt: poll.updatedAt,
		createdBy: poll.createdBy ? toUserDto(poll.createdBy) : null,
		totalVotes: (poll.options || []).reduce((sum, option) => sum + (option.votes?.length || 0), 0),
		options: (poll.options || [])
			.sort((optionA, optionB) => optionA.position - optionB.position)
			.map((option) => ({
				id: option.id,
				label: option.label,
				position: option.position,
				voteCount: option.votes?.length || 0,
				selectedByMe: (option.votes || []).some((vote) => vote.userId === viewerId),
			})),
	}));

const buildMemberActivity = async (conversation) => {
	const activityRows = await prisma.message.groupBy({
		by: ["senderId"],
		where: {
			conversationId: conversation.id,
			senderId: {
				in: conversation.members.map((member) => member.userId),
			},
		},
		_count: {
			_all: true,
		},
		_max: {
			createdAt: true,
		},
	});

	const activityMap = new Map(activityRows.map((row) => [row.senderId, row]));

	return conversation.members
		.map((member) => {
			const activity = activityMap.get(member.userId);
			return {
				user: member.user ? toUserDto(member.user) : null,
				memberRole: member.role,
				joinedAt: member.joinedAt,
				lastInteractionAt: activity?._max?.createdAt ?? member.lastReadAt ?? member.joinedAt ?? null,
				messageCount: activity?._count?._all ?? 0,
			};
		})
		.sort((entryA, entryB) => {
			if (entryB.messageCount !== entryA.messageCount) {
				return entryB.messageCount - entryA.messageCount;
			}

			const entryATime = entryA.lastInteractionAt ? new Date(entryA.lastInteractionAt).getTime() : 0;
			const entryBTime = entryB.lastInteractionAt ? new Date(entryB.lastInteractionAt).getTime() : 0;
			return entryBTime - entryATime;
		});
};

const buildGroupWorkspacePayload = async (conversation, viewerId) => {
	const viewerMembership = conversation.members.find((member) => member.userId === viewerId);
	const canManageWorkspace = isGroupManagerRole(viewerMembership?.role);
	const [inviteLinks, joinRequests, announcements, events, polls, memberActivity] = await Promise.all([
		canManageWorkspace
			? prisma.groupInviteLink.findMany({
					where: {
						conversationId: conversation.id,
						revokedAt: null,
					},
					orderBy: { createdAt: "desc" },
					take: 8,
					include: {
						createdBy: {
							select: userSelect,
						},
					},
			  })
			: Promise.resolve([]),
		canManageWorkspace
			? prisma.groupJoinRequest.findMany({
					where: {
						conversationId: conversation.id,
						status: "PENDING",
					},
					orderBy: { createdAt: "desc" },
					take: 20,
					include: {
						requester: {
							select: userSelect,
						},
						respondedBy: {
							select: userSelect,
						},
						inviteLink: {
							select: {
								id: true,
								code: true,
							},
						},
					},
			  })
			: Promise.resolve([]),
		prisma.groupAnnouncement.findMany({
			where: {
				conversationId: conversation.id,
			},
			orderBy: { createdAt: "desc" },
			take: 12,
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		}),
		prisma.groupEvent.findMany({
			where: {
				conversationId: conversation.id,
			},
			orderBy: { startsAt: "asc" },
			take: 12,
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		}),
		prisma.groupPoll.findMany({
			where: {
				conversationId: conversation.id,
			},
			orderBy: { createdAt: "desc" },
			take: 12,
			include: {
				createdBy: {
					select: userSelect,
				},
				options: {
					include: {
						votes: {
							select: {
								userId: true,
							},
						},
					},
				},
			},
		}),
		buildMemberActivity(conversation),
	]);

	return {
		group: {
			_id: conversation.id,
			slowModeSeconds: conversation.slowModeSeconds ?? null,
			pinnedRules: Array.isArray(conversation.pinnedRules) ? conversation.pinnedRules : [],
			isPrivate: Boolean(conversation.isPrivate),
			memberCount: conversation.members.length,
			viewerRole: viewerMembership?.role ?? CONVERSATION_MEMBER_ROLES.MEMBER,
			canManageWorkspace,
		},
		members: conversation.members.map((member) => ({
			...(member.user ? toUserDto(member.user) : { _id: member.userId }),
			memberRole: member.role,
			joinedAt: member.joinedAt,
			lastReadAt: member.lastReadAt ?? null,
		})),
		inviteLinks: formatInviteLinks(inviteLinks),
		joinRequests: formatJoinRequests(joinRequests),
		announcements: formatAnnouncements(announcements),
		events: formatEvents(events),
		polls: formatPolls(polls, viewerId),
		memberActivity,
	};
};

export const getGroupWorkspace = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const conversation = await getAccessibleGroupConversation(conversationId, userId);

		const membership = requireGroupMember(conversation, userId);
		if (!membership.ok) {
			return res.status(membership.status).json({ error: membership.error });
		}

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in getGroupWorkspace:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const updateGroupWorkspaceSettings = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const data = {};
		if (typeof req.body?.slowModeSeconds !== "undefined") {
			const normalizedSlowModeSeconds = parseSlowModeSeconds(req.body.slowModeSeconds);
			if (Number.isNaN(normalizedSlowModeSeconds)) {
				return res.status(400).json({ error: "Invalid slow mode duration" });
			}
			data.slowModeSeconds = normalizedSlowModeSeconds;
		}

		if (typeof req.body?.pinnedRules !== "undefined") {
			data.pinnedRules = normalizePinnedRules(req.body.pinnedRules);
		}

		if (Object.keys(data).length === 0) {
			return res.status(400).json({ error: "No workspace settings were provided" });
		}

		await prisma.conversation.update({
			where: { id: conversation.id },
			data,
		});

		const refreshedConversation = await getAccessibleGroupConversation(conversation.id, userId);
		const workspace = await buildGroupWorkspacePayload(refreshedConversation, userId);
		emitGroupWorkspaceUpdated(refreshedConversation, "settings");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in updateGroupWorkspaceSettings:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const createGroupAnnouncement = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
		if (!content) {
			return res.status(400).json({ error: "Announcement content is required" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const createdAnnouncement = await prisma.groupAnnouncement.create({
			data: {
				conversationId: conversation.id,
				content,
				createdById: userId,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		await emitGroupWorkspaceSystemMessage({
			conversationId: conversation.id,
			senderId: userId,
			rawMessage: buildGroupAnnouncementSystemMessage({
				actorName: createdAnnouncement.createdBy?.fullName || managerCheck.currentMember.user?.fullName,
				announcementId: createdAnnouncement.id,
				content: createdAnnouncement.content,
			}),
			audienceUserIds: conversation.members.map((member) => member.userId),
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "announcements");
		return res.status(201).json(workspace);
	} catch (error) {
		console.error("Error in createGroupAnnouncement:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const updateGroupAnnouncement = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, announcementId } = req.params;
		const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
		if (!content) {
			return res.status(400).json({ error: "Announcement content is required" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const existingAnnouncement = await prisma.groupAnnouncement.findFirst({
			where: {
				id: announcementId,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		if (!existingAnnouncement) {
			return res.status(404).json({ error: "Announcement not found" });
		}

		const existingAnnouncementMessage = await findAnnouncementSystemMessage(conversation.id, existingAnnouncement);

		const updatedAnnouncement = await prisma.groupAnnouncement.update({
			where: { id: existingAnnouncement.id },
			data: { content },
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		await updateGroupAnnouncementSystemMessage({
			conversation,
			announcement: updatedAnnouncement,
			existingMessageId: existingAnnouncementMessage?.id || null,
		});
		await emitGroupConversationUpsert(
			conversation.id,
			conversation.members.map((member) => member.userId)
		);

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "announcements");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in updateGroupAnnouncement:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteGroupAnnouncement = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, announcementId } = req.params;
		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const existingAnnouncement = await prisma.groupAnnouncement.findFirst({
			where: {
				id: announcementId,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		if (!existingAnnouncement) {
			return res.status(404).json({ error: "Announcement not found" });
		}

		const existingAnnouncementMessage = await findAnnouncementSystemMessage(conversation.id, existingAnnouncement);
		await prisma.groupAnnouncement.delete({
			where: { id: existingAnnouncement.id },
		});

		if (existingAnnouncementMessage) {
			await deleteMessageEverywhere(existingAnnouncementMessage);
		}

		await emitGroupConversationUpsert(
			conversation.id,
			conversation.members.map((member) => member.userId)
		);

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "announcements");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in deleteGroupAnnouncement:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const createGroupEvent = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
		const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
		const location = typeof req.body?.location === "string" ? req.body.location.trim() : "";
		const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : null;
		const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;

		if (!title || !startsAt || Number.isNaN(startsAt.getTime())) {
			return res.status(400).json({ error: "Title and valid start date are required" });
		}

		if (endsAt && Number.isNaN(endsAt.getTime())) {
			return res.status(400).json({ error: "Invalid end date" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const createdEvent = await prisma.groupEvent.create({
			data: {
				conversationId: conversation.id,
				title,
				description,
				location,
				startsAt,
				endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
				createdById: userId,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		await emitGroupWorkspaceSystemMessage({
			conversationId: conversation.id,
			senderId: userId,
			rawMessage: buildGroupEventCreatedSystemMessage({
				actorName: createdEvent.createdBy?.fullName || managerCheck.currentMember.user?.fullName,
				eventId: createdEvent.id,
				title: createdEvent.title,
				description: createdEvent.description,
				startsAt: createdEvent.startsAt,
				location: createdEvent.location,
			}),
			audienceUserIds: conversation.members.map((member) => member.userId),
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "events");
		return res.status(201).json(workspace);
	} catch (error) {
		console.error("Error in createGroupEvent:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const updateGroupEvent = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, eventId } = req.params;
		const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
		const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
		const location = typeof req.body?.location === "string" ? req.body.location.trim() : "";
		const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : null;
		const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;

		if (!title || !startsAt || Number.isNaN(startsAt.getTime())) {
			return res.status(400).json({ error: "Title and valid start date are required" });
		}

		if (endsAt && Number.isNaN(endsAt.getTime())) {
			return res.status(400).json({ error: "Invalid end date" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const existingEvent = await prisma.groupEvent.findFirst({
			where: {
				id: eventId,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		if (!existingEvent) {
			return res.status(404).json({ error: "Event not found" });
		}

		const updatedEvent = await prisma.groupEvent.update({
			where: { id: existingEvent.id },
			data: {
				title,
				description,
				location,
				startsAt,
				endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		await updateGroupEventSystemMessage({
			conversation,
			event: updatedEvent,
		});
		await emitGroupConversationUpsert(
			conversation.id,
			conversation.members.map((member) => member.userId)
		);

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "events");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in updateGroupEvent:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteGroupEvent = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, eventId } = req.params;
		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const existingEvent = await prisma.groupEvent.findFirst({
			where: {
				id: eventId,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
			},
		});

		if (!existingEvent) {
			return res.status(404).json({ error: "Event not found" });
		}

		const existingEventMessage = await findEventSystemMessage(conversation.id, existingEvent);
		await prisma.groupEvent.delete({
			where: { id: existingEvent.id },
		});

		if (existingEventMessage) {
			await deleteMessageEverywhere(existingEventMessage);
		}

		await emitGroupConversationUpsert(
			conversation.id,
			conversation.members.map((member) => member.userId)
		);

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "events");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in deleteGroupEvent:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const createGroupPoll = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
		const allowsMultiple = req.body?.allowsMultiple === true;
		const closesAt = req.body?.closesAt ? new Date(req.body.closesAt) : null;
		const options = Array.isArray(req.body?.options)
			? req.body.options.map((option) => String(option).trim()).filter(Boolean)
			: [];

		if (!question || options.length < 2) {
			return res.status(400).json({ error: "Question and at least two options are required" });
		}

		if (closesAt && Number.isNaN(closesAt.getTime())) {
			return res.status(400).json({ error: "Invalid poll close date" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const createdPoll = await prisma.groupPoll.create({
			data: {
				conversationId: conversation.id,
				question,
				allowsMultiple,
				closesAt: closesAt && !Number.isNaN(closesAt.getTime()) ? closesAt : null,
				createdById: userId,
				options: {
					create: options.slice(0, 8).map((option, index) => ({
						label: option,
						position: index,
					})),
				},
			},
			include: {
				createdBy: {
					select: userSelect,
				},
				options: {
					include: {
						votes: {
							select: {
								userId: true,
							},
						},
					},
				},
			},
		});

		await emitGroupWorkspaceSystemMessage({
			conversationId: conversation.id,
			senderId: userId,
			rawMessage: buildGroupPollCreatedSystemMessage({
				actorName: createdPoll.createdBy?.fullName || managerCheck.currentMember.user?.fullName,
				pollId: createdPoll.id,
				question: createdPoll.question,
				allowsMultiple: createdPoll.allowsMultiple,
				closesAt: createdPoll.closesAt,
				options: toPollSystemMessageOptions(createdPoll),
			}),
			audienceUserIds: conversation.members.map((member) => member.userId),
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "polls");
		return res.status(201).json(workspace);
	} catch (error) {
		console.error("Error in createGroupPoll:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const voteGroupPoll = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, pollId } = req.params;
		const optionId = typeof req.body?.optionId === "string" ? req.body.optionId.trim() : "";

		if (!optionId) {
			return res.status(400).json({ error: "Option is required" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const membership = requireGroupMember(conversation, userId);
		if (!membership.ok) {
			return res.status(membership.status).json({ error: membership.error });
		}

		const poll = await prisma.groupPoll.findFirst({
			where: {
				id: pollId,
				conversationId: conversation.id,
			},
			include: {
				options: true,
			},
		});

		if (!poll) {
			return res.status(404).json({ error: "Poll not found" });
		}

		if (poll.closesAt && new Date(poll.closesAt).getTime() < Date.now()) {
			return res.status(400).json({ error: "This poll is closed" });
		}

		const targetOption = poll.options.find((option) => option.id === optionId);
		if (!targetOption) {
			return res.status(404).json({ error: "Poll option not found" });
		}

		const existingVotes = await prisma.groupPollVote.findMany({
			where: {
				pollId: poll.id,
				userId,
			},
			select: {
				optionId: true,
			},
		});

		const alreadySelected = existingVotes.some((vote) => vote.optionId === optionId);

		if (alreadySelected) {
			await prisma.groupPollVote.delete({
				where: {
					optionId_userId: {
						optionId,
						userId,
					},
				},
			});
		} else {
			if (!poll.allowsMultiple && existingVotes.length > 0) {
				await prisma.groupPollVote.deleteMany({
					where: {
						pollId: poll.id,
						userId,
					},
				});
			}

			await prisma.groupPollVote.create({
				data: {
					pollId: poll.id,
					optionId,
					userId,
				},
			});
		}

		const updatedPoll = await prisma.groupPoll.findFirst({
			where: {
				id: poll.id,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
				options: {
					include: {
						votes: {
							select: {
								userId: true,
							},
						},
					},
				},
			},
		});

		if (updatedPoll) {
			await updateGroupPollSystemMessage({
				conversation,
				poll: updatedPoll,
			});
		}

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "polls");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in voteGroupPoll:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const updateGroupPoll = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, pollId } = req.params;
		const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
		const allowsMultiple = req.body?.allowsMultiple === true;
		const closesAt = req.body?.closesAt ? new Date(req.body.closesAt) : null;
		const options = Array.isArray(req.body?.options)
			? req.body.options.map((option) => String(option).trim()).filter(Boolean)
			: [];

		if (!question || options.length < 2) {
			return res.status(400).json({ error: "Question and at least two options are required" });
		}

		if (closesAt && Number.isNaN(closesAt.getTime())) {
			return res.status(400).json({ error: "Invalid poll close date" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const existingPoll = await prisma.groupPoll.findFirst({
			where: {
				id: pollId,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
				options: {
					include: {
						votes: {
							select: {
								userId: true,
							},
						},
					},
					orderBy: { position: "asc" },
				},
			},
		});

		if (!existingPoll) {
			return res.status(404).json({ error: "Poll not found" });
		}

		const normalizedOptions = options.slice(0, 8);
		const existingOptions = [...(existingPoll.options || [])].sort(
			(leftOption, rightOption) => leftOption.position - rightOption.position
		);
		const shouldResetVotes =
			existingPoll.allowsMultiple !== allowsMultiple ||
			existingOptions.length !== normalizedOptions.length ||
			existingOptions.some((option, index) => option.label !== normalizedOptions[index]);

		await prisma.$transaction(async (transaction) => {
			if (shouldResetVotes) {
				await transaction.groupPollVote.deleteMany({
					where: { pollId: existingPoll.id },
				});
				await transaction.groupPollOption.deleteMany({
					where: { pollId: existingPoll.id },
				});
				await transaction.groupPoll.update({
					where: { id: existingPoll.id },
					data: {
						question,
						allowsMultiple,
						closesAt: closesAt && !Number.isNaN(closesAt.getTime()) ? closesAt : null,
						options: {
							create: normalizedOptions.map((option, index) => ({
								label: option,
								position: index,
							})),
						},
					},
				});
				return;
			}

			await transaction.groupPoll.update({
				where: { id: existingPoll.id },
				data: {
					question,
					allowsMultiple,
					closesAt: closesAt && !Number.isNaN(closesAt.getTime()) ? closesAt : null,
				},
			});

			for (const [index, option] of existingOptions.entries()) {
				await transaction.groupPollOption.update({
					where: { id: option.id },
					data: {
						label: normalizedOptions[index],
						position: index,
					},
				});
			}
		});

		const updatedPoll = await prisma.groupPoll.findFirst({
			where: {
				id: existingPoll.id,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
				options: {
					include: {
						votes: {
							select: {
								userId: true,
							},
						},
					},
				},
			},
		});

		if (updatedPoll) {
			await updateGroupPollSystemMessage({
				conversation,
				poll: updatedPoll,
			});
		}

		await emitGroupConversationUpsert(
			conversation.id,
			conversation.members.map((member) => member.userId)
		);

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "polls");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in updateGroupPoll:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteGroupPoll = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, pollId } = req.params;
		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const existingPoll = await prisma.groupPoll.findFirst({
			where: {
				id: pollId,
				conversationId: conversation.id,
			},
			include: {
				createdBy: {
					select: userSelect,
				},
				options: {
					include: {
						votes: {
							select: {
								userId: true,
							},
						},
					},
				},
			},
		});

		if (!existingPoll) {
			return res.status(404).json({ error: "Poll not found" });
		}

		const existingPollMessage = await findPollSystemMessage(conversation.id, existingPoll);
		await prisma.groupPoll.delete({
			where: { id: existingPoll.id },
		});

		if (existingPollMessage) {
			await deleteMessageEverywhere(existingPollMessage);
		}

		await emitGroupConversationUpsert(
			conversation.id,
			conversation.members.map((member) => member.userId)
		);

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "polls");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in deleteGroupPoll:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const createGroupInviteLink = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId } = req.params;
		const expiresInDays =
			Number.isFinite(Number(req.body?.expiresInDays)) && Number(req.body.expiresInDays) > 0
				? Math.min(30, Number(req.body.expiresInDays))
				: 7;

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		await prisma.groupInviteLink.create({
			data: {
				conversationId: conversation.id,
				code: createInviteCode(),
				createdById: userId,
				expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
			},
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "invite-links");
		return res.status(201).json(workspace);
	} catch (error) {
		console.error("Error in createGroupInviteLink:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const revokeGroupInviteLink = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, linkId } = req.params;
		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		await prisma.groupInviteLink.updateMany({
			where: {
				id: linkId,
				conversationId: conversation.id,
				revokedAt: null,
			},
			data: {
				revokedAt: new Date(),
			},
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		emitGroupWorkspaceUpdated(conversation, "invite-links");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in revokeGroupInviteLink:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const joinGroupByInviteLink = async (req, res) => {
	try {
		const userId = req.user._id;
		const inviteInput = typeof req.body?.inviteLink === "string" ? req.body.inviteLink : "";
		const code = extractInviteCode(inviteInput);

		if (!code) {
			return res.status(400).json({ error: "Invite link or code is required" });
		}

		const inviteLink = await prisma.groupInviteLink.findFirst({
			where: {
				code,
				revokedAt: null,
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
			},
			include: {
				conversation: {
					include: {
						members: {
							include: {
								user: {
									select: userSelect,
								},
							},
						},
					},
				},
			},
		});

		if (!inviteLink?.conversation) {
			return res.status(404).json({ error: "Invite link not found or expired" });
		}

		const conversation = inviteLink.conversation;
		const existingMember = conversation.members.find((member) => member.userId === userId);
		if (existingMember) {
			const joinedConversation = await buildGroupConversationItemForUser(conversation.id, userId);
			return res.status(200).json({ status: "JOINED", conversation: joinedConversation });
		}

		if (conversation.memberLimit && conversation.members.length >= conversation.memberLimit) {
			return res.status(400).json({ error: "Member limit reached" });
		}

		if (conversation.isPrivate) {
			const existingPendingRequest = await prisma.groupJoinRequest.findFirst({
				where: {
					conversationId: conversation.id,
					requesterId: userId,
					status: "PENDING",
				},
				select: { id: true },
			});

			if (!existingPendingRequest) {
				await prisma.groupJoinRequest.create({
					data: {
						conversationId: conversation.id,
						requesterId: userId,
						inviteLinkId: inviteLink.id,
						status: "PENDING",
					},
				});

				emitGroupWorkspaceUpdated(conversation, "join-requests");
			}

			return res.status(200).json({ status: "REQUESTED" });
		}

		await prisma.conversationMember.create({
			data: {
				conversationId: conversation.id,
				userId,
				role: CONVERSATION_MEMBER_ROLES.MEMBER,
				lastReadAt: new Date(),
			},
		});

		const audienceUserIds = [...new Set([...conversation.members.map((member) => member.userId), userId])];
		await emitGroupConversationUpsert(conversation.id, audienceUserIds);
		emitPublicGroupsChanged();

		const joinedConversation = await buildGroupConversationItemForUser(conversation.id, userId);
		return res.status(200).json({ status: "JOINED", conversation: joinedConversation });
	} catch (error) {
		console.error("Error in joinGroupByInviteLink:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const respondToGroupJoinRequest = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: conversationId, requestId } = req.params;
		const action = typeof req.body?.action === "string" ? req.body.action.trim().toUpperCase() : "";

		if (!["APPROVE", "DECLINE"].includes(action)) {
			return res.status(400).json({ error: "Invalid request action" });
		}

		const conversation = await getAccessibleGroupConversation(conversationId, userId);
		const managerCheck = requireGroupManager(conversation, userId);
		if (!managerCheck.ok) {
			return res.status(managerCheck.status).json({ error: managerCheck.error });
		}

		const joinRequest = await prisma.groupJoinRequest.findFirst({
			where: {
				id: requestId,
				conversationId: conversation.id,
				status: "PENDING",
			},
			include: {
				requester: {
					select: userSelect,
				},
			},
		});

		if (!joinRequest) {
			return res.status(404).json({ error: "Join request not found" });
		}

		if (action === "APPROVE") {
			const alreadyMember = conversation.members.some((member) => member.userId === joinRequest.requesterId);
			if (!alreadyMember) {
				if (conversation.memberLimit && conversation.members.length >= conversation.memberLimit) {
					return res.status(400).json({ error: "Member limit reached" });
				}

				await prisma.conversationMember.create({
					data: {
						conversationId: conversation.id,
						userId: joinRequest.requesterId,
						role: CONVERSATION_MEMBER_ROLES.MEMBER,
						lastReadAt: new Date(),
					},
				});
			}
		}

		await prisma.groupJoinRequest.update({
			where: { id: joinRequest.id },
			data: {
				status: action === "APPROVE" ? "APPROVED" : "DECLINED",
				respondedById: userId,
				respondedAt: new Date(),
			},
		});

		if (action === "APPROVE") {
			const audienceUserIds = [...new Set([...conversation.members.map((member) => member.userId), joinRequest.requesterId])];
			await emitGroupConversationUpsert(conversation.id, audienceUserIds);
			if (!conversation.isPrivate) {
				emitPublicGroupsChanged();
			}
		}

		const refreshedConversation = await getAccessibleGroupConversation(conversation.id, userId);
		const workspace = await buildGroupWorkspacePayload(refreshedConversation, userId);
		emitGroupWorkspaceUpdated(refreshedConversation, "join-requests");
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in respondToGroupJoinRequest:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};
