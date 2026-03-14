import crypto from "crypto";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { getUserSocketIds, io } from "../socket/socket.js";
import { toConversationItemDto, toUserDto } from "../utils/formatters.js";
import {
	CONVERSATION_MEMBER_ROLES,
	CONVERSATION_TYPES,
	getGroupConversationForMember,
} from "../utils/conversations.js";
import {
	parseCallMessageContent,
	parseGroupInviteMessageContent,
	parseStoryInteractionMessageContent,
	parseSystemMessageContent,
} from "../utils/systemMessages.js";

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
		return parsedSystemMessage.text;
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
		createdBy: event.createdBy ? toUserDto(event.createdBy) : null,
	}));

const formatPolls = (polls, viewerId) =>
	(polls || []).map((poll) => ({
		id: poll.id,
		question: poll.question,
		allowsMultiple: Boolean(poll.allowsMultiple),
		closesAt: poll.closesAt ?? null,
		createdAt: poll.createdAt,
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
	const canManageWorkspace = isGroupModeratorRole(viewerMembership?.role);
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
		}

		await prisma.groupAnnouncement.create({
			data: {
				conversationId: conversation.id,
				content,
				createdById: userId,
			},
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		return res.status(201).json(workspace);
	} catch (error) {
		console.error("Error in createGroupAnnouncement:", error.message);
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
		}

		await prisma.groupEvent.create({
			data: {
				conversationId: conversation.id,
				title,
				description,
				location,
				startsAt,
				endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
				createdById: userId,
			},
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		return res.status(201).json(workspace);
	} catch (error) {
		console.error("Error in createGroupEvent:", error.message);
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
		}

		await prisma.groupPoll.create({
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
		});

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
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

		const workspace = await buildGroupWorkspacePayload(conversation, userId);
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in voteGroupPoll:", error.message);
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
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
		const moderationCheck = requireGroupModerator(conversation, userId);
		if (!moderationCheck.ok) {
			return res.status(moderationCheck.status).json({ error: moderationCheck.error });
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
		return res.status(200).json(workspace);
	} catch (error) {
		console.error("Error in respondToGroupJoinRequest:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};
