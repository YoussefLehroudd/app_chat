import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { getUserSocketIds, io } from "../socket/socket.js";
import { createAuditLog } from "../utils/auditLogs.js";
import { CONVERSATION_MEMBER_ROLES, CONVERSATION_TYPES } from "../utils/conversations.js";
import { ensureDeveloperPermission } from "../utils/developerPermissions.js";
import { toConversationItemDto, toConversationMemberDto, toMessageDto, toMessagePreviewDto, toUserDto } from "../utils/formatters.js";
import { emitDeveloperWorkspaceRefresh } from "../utils/realtime.js";
import { buildGroupMemberRemovedSystemMessage, parseGroupInviteMessageContent, parseSystemMessageContent } from "../utils/systemMessages.js";

const REPORT_STATUSES = {
	OPEN: "OPEN",
	IN_REVIEW: "IN_REVIEW",
	RESOLVED: "RESOLVED",
	DISMISSED: "DISMISSED",
};

const REPORT_PRIORITIES = {
	LOW: "LOW",
	MEDIUM: "MEDIUM",
	HIGH: "HIGH",
	CRITICAL: "CRITICAL",
};

const REPORT_TARGET_TYPES = {
	USER: "USER",
	GROUP: "GROUP",
	MESSAGE: "MESSAGE",
};

const MODERATION_RULE_SCOPES = {
	MESSAGE: "MESSAGE",
	USERNAME: "USERNAME",
	PROFILE: "PROFILE",
	REPORT: "REPORT",
};

const GROUP_ROLE_ORDER = {
	[CONVERSATION_MEMBER_ROLES.OWNER]: 0,
	[CONVERSATION_MEMBER_ROLES.ADMIN]: 1,
	[CONVERSATION_MEMBER_ROLES.MODERATOR]: 2,
	[CONVERSATION_MEMBER_ROLES.MEMBER]: 3,
};

const DEVELOPER_GROUP_MESSAGE_LIMIT = 80;

const developerUserSelect = {
	id: true,
	fullName: true,
	username: true,
	role: true,
	isPrimaryDeveloper: true,
	isArchived: true,
	archivedAt: true,
	isBanned: true,
	bannedAt: true,
	bannedReason: true,
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
		createdAt: true,
	},
});

const groupConversationInclude = {
	members: {
		include: {
			user: {
				select: developerUserSelect,
			},
		},
		orderBy: { joinedAt: "asc" },
	},
};

const developerGroupMessageInclude = {
	sender: {
		select: developerUserSelect,
	},
	conversation: {
		select: {
			type: true,
			title: true,
		},
	},
	repliedMessage: {
		include: {
			sender: {
				select: developerUserSelect,
			},
			conversation: {
				select: {
					type: true,
					title: true,
				},
			},
		},
	},
};

const developerGroupMemberInclude = {
	include: {
		user: {
			select: developerUserSelect,
		},
	},
	orderBy: { joinedAt: "asc" },
};

const developerGroupDetailsInclude = {
	createdBy: {
		select: developerUserSelect,
	},
	members: developerGroupMemberInclude,
	messages: {
		orderBy: { createdAt: "desc" },
		take: DEVELOPER_GROUP_MESSAGE_LIMIT,
		include: developerGroupMessageInclude,
	},
	_count: {
		select: {
			members: true,
			messages: true,
		},
	},
};

const reportInclude = {
	createdBy: {
		select: developerUserSelect,
	},
	reviewedBy: {
		select: developerUserSelect,
	},
	assignedTo: {
		select: developerUserSelect,
	},
	targetUser: {
		select: developerUserSelect,
	},
	targetConversation: {
		select: {
			id: true,
			type: true,
			title: true,
			isPrivate: true,
			profilePic: true,
			createdAt: true,
			updatedAt: true,
		},
	},
	targetMessage: {
		include: {
			sender: {
				select: developerUserSelect,
			},
			conversation: {
				select: {
					id: true,
					type: true,
					title: true,
					isPrivate: true,
				},
			},
		},
	},
	events: {
		orderBy: { createdAt: "asc" },
		include: {
			actor: {
				select: developerUserSelect,
			},
		},
	},
};

const normalizeText = (value, maxLength = 500) => {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, maxLength);
};

const normalizeReportPriority = (value) => {
	const normalizedValue = typeof value === "string" ? value.trim().toUpperCase() : "";
	return Object.values(REPORT_PRIORITIES).includes(normalizedValue)
		? normalizedValue
		: REPORT_PRIORITIES.MEDIUM;
};

const normalizeModerationRuleScope = (value) => {
	const normalizedValue = typeof value === "string" ? value.trim().toUpperCase() : "";
	return Object.values(MODERATION_RULE_SCOPES).includes(normalizedValue)
		? normalizedValue
		: MODERATION_RULE_SCOPES.MESSAGE;
};

const buildModerationTextBlocks = (report) => [
	{
		scope: MODERATION_RULE_SCOPES.REPORT,
		value: [report.reason, report.details].filter(Boolean).join("\n"),
	},
	{
		scope: MODERATION_RULE_SCOPES.MESSAGE,
		value: [
			report.targetMessage?.message,
			report.targetMessage?.attachmentFileName,
			report.targetMessage?.attachmentMimeType,
		]
			.filter(Boolean)
			.join("\n"),
	},
	{
		scope: MODERATION_RULE_SCOPES.USERNAME,
		value: report.targetUser?.username || "",
	},
	{
		scope: MODERATION_RULE_SCOPES.PROFILE,
		value: [report.targetUser?.fullName, report.targetUser?.bio].filter(Boolean).join("\n"),
	},
];

const moderationRuleMatchesText = (rule, text) => {
	if (!rule?.pattern || !text) {
		return false;
	}

	if (rule.isRegex) {
		try {
			return new RegExp(rule.pattern, "i").test(text);
		} catch {
			return false;
		}
	}

	return text.toLowerCase().includes(rule.pattern.toLowerCase());
};

const buildModerationInsights = ({ report, rules = [], relatedReportCount = 0, repeatedReasonCount = 0 }) => {
	const textBlocks = buildModerationTextBlocks(report);
	const matchedRules = rules
		.filter((rule) => {
			if (!rule?.isActive) return false;
			const matchingText = textBlocks.find((block) => block.scope === rule.scope);
			return moderationRuleMatchesText(rule, matchingText?.value || "");
		})
		.map((rule) => ({
			id: rule.id,
			label: rule.label,
			scope: rule.scope,
			severity: rule.severity,
			actionHint: rule.actionHint || "",
		}));

	const severityWeight = matchedRules.reduce((sum, rule) => {
		if (rule.severity === REPORT_PRIORITIES.CRITICAL) return sum + 4;
		if (rule.severity === REPORT_PRIORITIES.HIGH) return sum + 3;
		if (rule.severity === REPORT_PRIORITIES.MEDIUM) return sum + 2;
		return sum + 1;
	}, 0);
	const repeatedAbuseScore = Math.max(0, relatedReportCount - 1) + Math.max(0, repeatedReasonCount - 1);
	const totalScore = severityWeight + repeatedAbuseScore;

	return {
		matchedRules,
		relatedReportCount,
		repeatedReasonCount,
		riskLevel:
			totalScore >= 8
				? "CRITICAL"
				: totalScore >= 5
					? "HIGH"
					: totalScore >= 3
						? "MEDIUM"
						: "LOW",
	};
};

const parseGroupMemberLimit = (memberLimit) => {
	if (memberLimit === null || memberLimit === undefined || memberLimit === "") {
		return null;
	}

	const parsedValue = Number.parseInt(memberLimit, 10);
	if (!Number.isFinite(parsedValue) || parsedValue < 2) {
		return Number.NaN;
	}

	return parsedValue;
};

const handleWorkspaceError = (error, res, contextLabel) => {
	console.error(`Error in ${contextLabel}:`, error.message);
	if (isPrismaConnectionError(error)) {
		return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
	}
	return res.status(500).json({ error: "Internal server error" });
};

const sortDeveloperConversationMembers = (memberA, memberB) => {
	const rankA = GROUP_ROLE_ORDER[memberA?.role] ?? Number.MAX_SAFE_INTEGER;
	const rankB = GROUP_ROLE_ORDER[memberB?.role] ?? Number.MAX_SAFE_INTEGER;
	if (rankA !== rankB) {
		return rankA - rankB;
	}

	const joinedAtA = memberA?.joinedAt ? new Date(memberA.joinedAt).getTime() : 0;
	const joinedAtB = memberB?.joinedAt ? new Date(memberB.joinedAt).getTime() : 0;
	return joinedAtA - joinedAtB;
};

const getLatestMessagePreview = (latestMessage) => {
	if (!latestMessage) return null;
	if (latestMessage.audio) return "Audio message";
	if (latestMessage.attachmentType) {
		return latestMessage.attachmentFileName?.trim() || (latestMessage.attachmentType === "IMAGE"
			? "Photo"
			: latestMessage.attachmentType === "VIDEO"
				? "Video"
				: latestMessage.attachmentType === "PDF"
					? "PDF"
					: "File");
	}

	const parsedSystemMessage = parseSystemMessageContent(latestMessage.message);
	if (parsedSystemMessage) {
		return parsedSystemMessage.text;
	}

	const parsedGroupInvite = parseGroupInviteMessageContent(latestMessage.message);
	if (parsedGroupInvite) {
		return "Group invitation";
	}

	return latestMessage.message?.trim() || "Message";
};

const emitToUsers = (userIds, eventName, payload) => {
	[...new Set(userIds.filter(Boolean))].forEach((userId) => {
		getUserSocketIds(userId).forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const emitPublicGroupsChanged = () => {
	io.emit("publicGroupsChanged");
};

const emitGroupConversationRemoved = (conversationId, userIds) => {
	emitToUsers(userIds, "conversationRemoved", { conversationId });
};

const mapDeveloperGroup = (conversation, { includeMessages = false } = {}) => {
	const sortedMembers = [...(conversation.members || [])].sort(sortDeveloperConversationMembers);
	const members = sortedMembers.map(toConversationMemberDto).filter(Boolean);
	const messages = (conversation.messages || []).map(toMessageDto);
	const latestMessage = messages[0] ?? null;
	const owner = members.find((member) => member.memberRole === CONVERSATION_MEMBER_ROLES.OWNER) ?? null;

	return {
		_id: conversation.id,
		type: CONVERSATION_TYPES.GROUP,
		title: conversation.title || "Untitled group",
		description: conversation.description ?? "",
		profilePic: conversation.profilePic || "",
		isPrivate: conversation.isPrivate ?? false,
		memberLimit: conversation.memberLimit ?? null,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
		createdById: conversation.createdById ?? null,
		createdBy: conversation.createdBy ? toUserDto(conversation.createdBy) : null,
		memberCount: conversation._count?.members ?? members.length,
		messageCount: conversation._count?.messages ?? 0,
		owner,
		members,
		latestMessage,
		latestActivityAt: latestMessage?.createdAt ?? conversation.updatedAt,
		messages: includeMessages ? messages : undefined,
		messageWindowSize: includeMessages ? DEVELOPER_GROUP_MESSAGE_LIMIT : undefined,
	};
};

const getDeveloperGroupConversationById = async (conversationId, includeMessages = false) =>
	prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: CONVERSATION_TYPES.GROUP,
		},
		include: includeMessages
			? developerGroupDetailsInclude
			: {
					createdBy: {
						select: developerUserSelect,
					},
					members: developerGroupMemberInclude,
					messages: {
						orderBy: { createdAt: "desc" },
						take: 1,
						include: developerGroupMessageInclude,
					},
					_count: {
						select: {
							members: true,
							messages: true,
						},
					},
			  },
	});

const getAvailableUsersByIds = async (userIds) =>
	prisma.user.findMany({
		where: {
			id: { in: userIds },
			isArchived: false,
			isBanned: false,
		},
		select: developerUserSelect,
	});

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
			...groupConversationInclude,
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

	return toConversationItemDto(
		{
			...conversation,
			lastMessage: getLatestMessagePreview(latestMessage),
			lastMessageAt: latestMessage?.createdAt ?? null,
			unreadCount,
			groupRole: currentMember?.role ?? null,
		},
		viewerId
	);
};

const emitGroupConversationUpsert = async (conversationId, userIds) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

	await Promise.all(
		uniqueUserIds.map(async (userId) => {
			const conversation = await buildGroupConversationItemForUser(conversationId, userId);
			if (!conversation) return;
			emitToUsers([userId], "conversationUpserted", conversation);
		})
	);
};

const emitGroupSystemMessage = async ({ conversationId, senderId, rawMessage, userIds }) => {
	const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
	if (!rawMessage || uniqueUserIds.length === 0) {
		return null;
	}

	const message = await prisma.message.create({
		data: {
			conversationId,
			senderId,
			receiverId: null,
			message: rawMessage,
		},
		include: {
			sender: {
				select: developerUserSelect,
			},
			conversation: {
				select: {
					type: true,
				},
			},
		},
	});

	const formattedMessage = toMessageDto(message);
	emitToUsers(uniqueUserIds, "newMessage", formattedMessage);
	return formattedMessage;
};

const logDeveloperAudit = async (actor, entry) => {
	try {
		await createAuditLog({
			actorId: actor?._id || null,
			...entry,
		});
	} catch (error) {
		console.error("Error logging developer audit:", error.message);
	}
};

const mapReportStatusEvent = (event) => ({
	_id: event.id,
	status: event.status,
	priority: event.priority ?? null,
	note: event.note ?? "",
	actionTaken: event.actionTaken ?? "",
	createdAt: event.createdAt,
	actor: event.actor ? toUserDto(event.actor) : null,
});

const mapReport = (report, insights = null) => {
	const targetMessage = report.targetMessage ? toMessagePreviewDto(report.targetMessage) : null;
	return {
		_id: report.id,
		status: report.status,
		priority: report.priority ?? REPORT_PRIORITIES.MEDIUM,
		targetType: report.targetType,
		reason: report.reason,
		details: report.details ?? "",
		resolutionNote: report.resolutionNote ?? "",
		actionTaken: report.actionTaken ?? "",
		targetLabel:
			report.targetLabel ||
			report.targetUser?.fullName ||
			report.targetConversation?.title ||
			targetMessage?.previewText ||
			"Unknown target",
		createdAt: report.createdAt,
		updatedAt: report.updatedAt,
		reviewedAt: report.reviewedAt ?? null,
		createdBy: report.createdBy ? toUserDto(report.createdBy) : null,
		reviewedBy: report.reviewedBy ? toUserDto(report.reviewedBy) : null,
		assignedTo: report.assignedTo ? toUserDto(report.assignedTo) : null,
		targetUser: report.targetUser ? toUserDto(report.targetUser) : null,
		targetConversation: report.targetConversation
			? {
					_id: report.targetConversation.id,
					title: report.targetConversation.title || "Untitled group",
					type: report.targetConversation.type,
					isPrivate: report.targetConversation.isPrivate ?? false,
					profilePic: report.targetConversation.profilePic || "",
					createdAt: report.targetConversation.createdAt,
					updatedAt: report.targetConversation.updatedAt,
			  }
			: null,
		targetMessage,
		timeline: (report.events || []).map(mapReportStatusEvent),
		moderationInsights: insights,
	};
};

const mapAuditLog = (log) => ({
	_id: log.id,
	actor: log.actor ? toUserDto(log.actor) : null,
	action: log.action,
	entityType: log.entityType,
	entityId: log.entityId ?? null,
	entityLabel: log.entityLabel ?? "",
	summary: log.summary,
	details: log.details ?? null,
	createdAt: log.createdAt,
});

const resolveReportTarget = async (targetType, targetId) => {
	if (!targetId) {
		const error = new Error("Target is required");
		error.statusCode = 400;
		throw error;
	}

	if (targetType === REPORT_TARGET_TYPES.USER) {
		const user = await prisma.user.findUnique({
			where: { id: targetId },
			select: developerUserSelect,
		});

		if (!user) {
			const error = new Error("Target user not found");
			error.statusCode = 404;
			throw error;
		}

		return {
			targetUserId: user.id,
			targetConversationId: null,
			targetMessageId: null,
			targetLabel: `${user.fullName} (@${user.username})`,
		};
	}

	if (targetType === REPORT_TARGET_TYPES.GROUP) {
		const conversation = await prisma.conversation.findFirst({
			where: {
				id: targetId,
				type: CONVERSATION_TYPES.GROUP,
			},
			select: {
				id: true,
				title: true,
			},
		});

		if (!conversation) {
			const error = new Error("Target group not found");
			error.statusCode = 404;
			throw error;
		}

		return {
			targetUserId: null,
			targetConversationId: conversation.id,
			targetMessageId: null,
			targetLabel: conversation.title || "Untitled group",
		};
	}

	if (targetType === REPORT_TARGET_TYPES.MESSAGE) {
		const message = await prisma.message.findFirst({
			where: {
				id: targetId,
				conversation: {
					type: CONVERSATION_TYPES.GROUP,
				},
			},
			include: {
				sender: {
					select: developerUserSelect,
				},
				conversation: {
					select: {
						id: true,
						title: true,
						type: true,
					},
				},
			},
		});

		if (!message) {
			const error = new Error("Target group message not found");
			error.statusCode = 404;
			throw error;
		}

		return {
			targetUserId: null,
			targetConversationId: message.conversationId,
			targetMessageId: message.id,
			targetLabel: `${message.sender?.fullName || "Unknown user"} in ${message.conversation?.title || "group"}`,
		};
	}

	const error = new Error("Invalid report target type");
	error.statusCode = 400;
	throw error;
};

const resolveReportAssignment = async (assignedToId) => {
	const normalizedAssignedToId = typeof assignedToId === "string" ? assignedToId.trim() : "";
	if (!normalizedAssignedToId) {
		return null;
	}

	const assignedDeveloper = await prisma.user.findUnique({
		where: { id: normalizedAssignedToId },
		select: {
			id: true,
			role: true,
			isArchived: true,
			isBanned: true,
		},
	});

	if (!assignedDeveloper || assignedDeveloper.role !== "DEVELOPER" || assignedDeveloper.isArchived || assignedDeveloper.isBanned) {
		const error = new Error("Assigned reviewer must be an active developer");
		error.statusCode = 400;
		throw error;
	}

	return assignedDeveloper.id;
};

const buildReportAnalyticsMaps = (reports) => {
	const targetCountMap = new Map();
	const reasonCountMap = new Map();

	for (const report of reports) {
		const targetKey =
			report.targetMessageId ||
			report.targetConversationId ||
			report.targetUserId ||
			`${report.targetType}:${report.targetLabel || report.id}`;
		const reasonKey = (report.reason || "").trim().toLowerCase();

		targetCountMap.set(targetKey, (targetCountMap.get(targetKey) || 0) + 1);
		if (reasonKey) {
			reasonCountMap.set(reasonKey, (reasonCountMap.get(reasonKey) || 0) + 1);
		}
	}

	return { reasonCountMap, targetCountMap };
};

export const getDeveloperReports = async (req, res) => {
	try {
		const [reports, rules] = await Promise.all([
			prisma.report.findMany({
				orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
				include: reportInclude,
			}),
			prisma.contentModerationRule.findMany({
				where: { isActive: true },
				orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
			}),
		]);
		const { reasonCountMap, targetCountMap } = buildReportAnalyticsMaps(reports);

		return res.status(200).json(
			reports.map((report) => {
				const targetKey =
					report.targetMessageId ||
					report.targetConversationId ||
					report.targetUserId ||
					`${report.targetType}:${report.targetLabel || report.id}`;
				const reasonKey = (report.reason || "").trim().toLowerCase();
				return mapReport(
					report,
					buildModerationInsights({
						report,
						rules,
						relatedReportCount: targetCountMap.get(targetKey) || 0,
						repeatedReasonCount: reasonKey ? reasonCountMap.get(reasonKey) || 0 : 0,
					})
				);
			})
		);
	} catch (error) {
		return handleWorkspaceError(error, res, "getDeveloperReports");
	}
};

export const createDeveloperReport = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to create reports");
		const targetType = typeof req.body?.targetType === "string" ? req.body.targetType.trim().toUpperCase() : "";
		const targetId = typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
		const reason = normalizeText(req.body?.reason, 220);
		const details = normalizeText(req.body?.details, 2000);
		const priority = normalizeReportPriority(req.body?.priority);

		if (!Object.values(REPORT_TARGET_TYPES).includes(targetType)) {
			return res.status(400).json({ error: "Invalid report target type" });
		}

		if (!reason) {
			return res.status(400).json({ error: "Report reason is required" });
		}

		const [target, assignedToId] = await Promise.all([
			resolveReportTarget(targetType, targetId),
			resolveReportAssignment(req.body?.assignedToId),
		]);
		const report = await prisma.report.create({
			data: {
				createdById: req.user._id,
				assignedToId,
				targetType,
				priority,
				reason,
				details,
				...target,
				events: {
					create: {
						actorId: req.user._id,
						status: REPORT_STATUSES.OPEN,
						priority,
						note: details || null,
					},
				},
			},
			include: reportInclude,
		});

		await logDeveloperAudit(req.user, {
			action: "REPORT_CREATED",
			entityType: "REPORT",
			entityId: report.id,
			entityLabel: target.targetLabel,
			summary: `${req.user.fullName} created a ${targetType.toLowerCase()} report`,
			details: {
				targetType,
				targetId,
				reason,
				priority,
				assignedToId,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "REPORT_CREATED",
			entityType: "REPORT",
			entityId: report.id,
		});

		return res.status(201).json({
			message: "Report created successfully",
			report: mapReport(report),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleWorkspaceError(error, res, "createDeveloperReport");
	}
};

export const updateDeveloperReport = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to update reports");
		const { id } = req.params;
		const status = typeof req.body?.status === "string" ? req.body.status.trim().toUpperCase() : "";
		const resolutionNote = normalizeText(req.body?.resolutionNote, 1200);
		const actionTaken = normalizeText(req.body?.actionTaken, 500);
		const priority = normalizeReportPriority(req.body?.priority);
		const assignedToId = await resolveReportAssignment(
			Object.prototype.hasOwnProperty.call(req.body || {}, "assignedToId") ? req.body?.assignedToId : undefined
		);

		if (!Object.values(REPORT_STATUSES).includes(status)) {
			return res.status(400).json({ error: "Invalid report status" });
		}

		const existingReport = await prisma.report.findUnique({
			where: { id },
			include: reportInclude,
		});

		if (!existingReport) {
			return res.status(404).json({ error: "Report not found" });
		}

		const hasStatusChanged = existingReport.status !== status;
		const hasPriorityChanged = existingReport.priority !== priority;
		const hasAssignmentChanged =
			(existingReport.assignedToId || null) !==
			(Object.prototype.hasOwnProperty.call(req.body || {}, "assignedToId") ? assignedToId : existingReport.assignedToId || null);
		const nextAssignedToId = Object.prototype.hasOwnProperty.call(req.body || {}, "assignedToId")
			? assignedToId
			: existingReport.assignedToId || null;

		const report = await prisma.report.update({
			where: { id },
			data: {
				status,
				priority,
				assignedToId: nextAssignedToId,
				resolutionNote: resolutionNote || null,
				actionTaken: actionTaken || null,
				reviewedById: status === REPORT_STATUSES.OPEN ? null : req.user._id,
				reviewedAt: status === REPORT_STATUSES.OPEN ? null : new Date(),
				events:
					hasStatusChanged || hasPriorityChanged || resolutionNote || actionTaken || hasAssignmentChanged
						? {
								create: {
									actorId: req.user._id,
									status,
									priority,
									note: resolutionNote || null,
									actionTaken: actionTaken || null,
								},
						  }
						: undefined,
			},
			include: reportInclude,
		});

		await logDeveloperAudit(req.user, {
			action: "REPORT_UPDATED",
			entityType: "REPORT",
			entityId: report.id,
			entityLabel: report.targetLabel || mapReport(report).targetLabel,
			summary: `${req.user.fullName} marked a report as ${status.toLowerCase().replace("_", " ")}`,
			details: {
				previousStatus: existingReport.status,
				nextStatus: status,
				previousPriority: existingReport.priority,
				nextPriority: priority,
				previousAssignedToId: existingReport.assignedToId || null,
				nextAssignedToId,
				actionTaken: actionTaken || null,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "REPORT_UPDATED",
			entityType: "REPORT",
			entityId: report.id,
		});

		return res.status(200).json({
			message: "Report updated successfully",
			report: mapReport(report),
		});
	} catch (error) {
		return handleWorkspaceError(error, res, "updateDeveloperReport");
	}
};

export const deleteDeveloperReport = async (req, res) => {
	try {
		ensureDeveloperPermission(
			req.user,
			"deleteReports",
			"Only the primary developer or a delegated developer can delete reports"
		);

		const { id } = req.params;
		const existingReport = await prisma.report.findUnique({
			where: { id },
			include: reportInclude,
		});

		if (!existingReport) {
			return res.status(404).json({ error: "Report not found" });
		}

		await prisma.report.delete({
			where: { id },
		});

		await logDeveloperAudit(req.user, {
			action: "REPORT_DELETED",
			entityType: "REPORT",
			entityId: id,
			entityLabel: existingReport.targetLabel || mapReport(existingReport).targetLabel,
			summary: `${req.user.fullName} deleted a report`,
			details: {
				targetType: existingReport.targetType,
				reason: existingReport.reason,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "REPORT_DELETED",
			entityType: "REPORT",
			entityId: id,
		});

		return res.status(200).json({ message: "Report deleted successfully", reportId: id });
	} catch (error) {
		return handleWorkspaceError(error, res, "deleteDeveloperReport");
	}
};

export const getDeveloperAuditLogs = async (req, res) => {
	try {
		const auditLogs = await prisma.auditLog.findMany({
			orderBy: { createdAt: "desc" },
			take: 180,
			include: {
				actor: {
					select: developerUserSelect,
				},
			},
		});

		return res.status(200).json(auditLogs.map(mapAuditLog));
	} catch (error) {
		return handleWorkspaceError(error, res, "getDeveloperAuditLogs");
	}
};

const mapModerationRule = (rule) => ({
	_id: rule.id,
	label: rule.label,
	pattern: rule.pattern,
	isRegex: Boolean(rule.isRegex),
	scope: rule.scope,
	severity: rule.severity,
	actionHint: rule.actionHint || "",
	isActive: Boolean(rule.isActive),
	createdAt: rule.createdAt,
	updatedAt: rule.updatedAt,
	createdBy: rule.createdBy ? toUserDto(rule.createdBy) : null,
});

export const getDeveloperModerationCenter = async (req, res) => {
	try {
		const [reports, rules] = await Promise.all([
			prisma.report.findMany({
				orderBy: [{ createdAt: "desc" }],
				include: reportInclude,
			}),
			prisma.contentModerationRule.findMany({
				orderBy: [{ isActive: "desc" }, { severity: "desc" }, { createdAt: "desc" }],
				include: {
					createdBy: {
						select: developerUserSelect,
					},
				},
			}),
		]);

		const { reasonCountMap, targetCountMap } = buildReportAnalyticsMaps(reports);
		const topReasons = Array.from(reasonCountMap.entries())
			.sort((entryA, entryB) => entryB[1] - entryA[1])
			.slice(0, 5)
			.map(([reason, count]) => ({ reason, count }));
		const repeatTargets = reports
			.map((report) => {
				const targetKey =
					report.targetMessageId ||
					report.targetConversationId ||
					report.targetUserId ||
					`${report.targetType}:${report.targetLabel || report.id}`;
				return {
					targetKey,
					targetLabel: report.targetLabel || report.targetUser?.fullName || report.targetConversation?.title || "Unknown target",
					count: targetCountMap.get(targetKey) || 0,
				};
			})
			.filter((entry, index, entries) => entry.count > 1 && entries.findIndex((candidate) => candidate.targetKey === entry.targetKey) === index)
			.sort((entryA, entryB) => entryB.count - entryA.count)
			.slice(0, 5);

		const keywordHitsMap = new Map();
		const mappedQueue = reports.map((report) => {
			const targetKey =
				report.targetMessageId ||
				report.targetConversationId ||
				report.targetUserId ||
				`${report.targetType}:${report.targetLabel || report.id}`;
			const reasonKey = (report.reason || "").trim().toLowerCase();
			const insights = buildModerationInsights({
				report,
				rules,
				relatedReportCount: targetCountMap.get(targetKey) || 0,
				repeatedReasonCount: reasonKey ? reasonCountMap.get(reasonKey) || 0 : 0,
			});

			insights.matchedRules.forEach((rule) => {
				keywordHitsMap.set(rule.label, (keywordHitsMap.get(rule.label) || 0) + 1);
			});

			return mapReport(report, insights);
		});

		const keywordHits = Array.from(keywordHitsMap.entries())
			.sort((entryA, entryB) => entryB[1] - entryA[1])
			.slice(0, 6)
			.map(([label, count]) => ({ label, count }));

		return res.status(200).json({
			queue: mappedQueue,
			rules: rules.map(mapModerationRule),
			summary: {
				openCount: reports.filter((report) => report.status === REPORT_STATUSES.OPEN).length,
				inReviewCount: reports.filter((report) => report.status === REPORT_STATUSES.IN_REVIEW).length,
				criticalCount: reports.filter((report) => report.priority === REPORT_PRIORITIES.CRITICAL).length,
				highCount: reports.filter((report) => report.priority === REPORT_PRIORITIES.HIGH).length,
			},
			abusePatterns: {
				topReasons,
				repeatTargets,
				keywordHits,
			},
		});
	} catch (error) {
		return handleWorkspaceError(error, res, "getDeveloperModerationCenter");
	}
};

export const createDeveloperModerationRule = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to manage moderation rules");
		const label = normalizeText(req.body?.label, 120);
		const pattern = normalizeText(req.body?.pattern, 240);
		const actionHint = normalizeText(req.body?.actionHint, 320);
		const scope = normalizeModerationRuleScope(req.body?.scope);
		const severity = normalizeReportPriority(req.body?.severity);
		const isRegex = req.body?.isRegex === true || req.body?.isRegex === "true";
		const isActive = req.body?.isActive !== false && req.body?.isActive !== "false";

		if (!label || !pattern) {
			return res.status(400).json({ error: "Rule label and pattern are required" });
		}

		const rule = await prisma.contentModerationRule.create({
			data: {
				label,
				pattern,
				scope,
				severity,
				actionHint: actionHint || null,
				isRegex,
				isActive,
				createdById: req.user._id,
			},
			include: {
				createdBy: {
					select: developerUserSelect,
				},
			},
		});

		await logDeveloperAudit(req.user, {
			action: "MODERATION_RULE_CREATED",
			entityType: "MODERATION_RULE",
			entityId: rule.id,
			entityLabel: rule.label,
			summary: `${req.user.fullName} created a moderation rule`,
			details: { scope, severity, isRegex, isActive },
		});
		emitDeveloperWorkspaceRefresh({
			action: "MODERATION_RULE_CREATED",
			entityType: "MODERATION_RULE",
			entityId: rule.id,
		});

		return res.status(201).json({
			message: "Moderation rule created",
			rule: mapModerationRule(rule),
		});
	} catch (error) {
		return handleWorkspaceError(error, res, "createDeveloperModerationRule");
	}
};

export const updateDeveloperModerationRule = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to manage moderation rules");
		const { id } = req.params;
		const existingRule = await prisma.contentModerationRule.findUnique({
			where: { id },
			include: {
				createdBy: {
					select: developerUserSelect,
				},
			},
		});

		if (!existingRule) {
			return res.status(404).json({ error: "Moderation rule not found" });
		}

		const nextLabel = typeof req.body?.label === "string" ? normalizeText(req.body.label, 120) : existingRule.label;
		const nextPattern =
			typeof req.body?.pattern === "string" ? normalizeText(req.body.pattern, 240) : existingRule.pattern;
		const nextActionHint =
			typeof req.body?.actionHint === "string"
				? normalizeText(req.body.actionHint, 320) || null
				: existingRule.actionHint;
		const nextScope =
			typeof req.body?.scope === "string" ? normalizeModerationRuleScope(req.body.scope) : existingRule.scope;
		const nextSeverity =
			typeof req.body?.severity === "string" ? normalizeReportPriority(req.body.severity) : existingRule.severity;
		const nextIsRegex =
			typeof req.body?.isRegex !== "undefined" ? req.body.isRegex === true || req.body.isRegex === "true" : existingRule.isRegex;
		const nextIsActive =
			typeof req.body?.isActive !== "undefined"
				? req.body.isActive === true || req.body.isActive === "true"
				: existingRule.isActive;

		if (!nextLabel || !nextPattern) {
			return res.status(400).json({ error: "Rule label and pattern are required" });
		}

		const rule = await prisma.contentModerationRule.update({
			where: { id },
			data: {
				label: nextLabel,
				pattern: nextPattern,
				scope: nextScope,
				severity: nextSeverity,
				actionHint: nextActionHint,
				isRegex: nextIsRegex,
				isActive: nextIsActive,
			},
			include: {
				createdBy: {
					select: developerUserSelect,
				},
			},
		});

		await logDeveloperAudit(req.user, {
			action: "MODERATION_RULE_UPDATED",
			entityType: "MODERATION_RULE",
			entityId: rule.id,
			entityLabel: rule.label,
			summary: `${req.user.fullName} updated a moderation rule`,
			details: {
				previous: {
					label: existingRule.label,
					scope: existingRule.scope,
					severity: existingRule.severity,
					isRegex: existingRule.isRegex,
					isActive: existingRule.isActive,
				},
				next: {
					label: rule.label,
					scope: rule.scope,
					severity: rule.severity,
					isRegex: rule.isRegex,
					isActive: rule.isActive,
				},
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "MODERATION_RULE_UPDATED",
			entityType: "MODERATION_RULE",
			entityId: rule.id,
		});

		return res.status(200).json({
			message: "Moderation rule updated",
			rule: mapModerationRule(rule),
		});
	} catch (error) {
		return handleWorkspaceError(error, res, "updateDeveloperModerationRule");
	}
};

export const deleteDeveloperModerationRule = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to manage moderation rules");
		const { id } = req.params;
		const existingRule = await prisma.contentModerationRule.findUnique({
			where: { id },
			select: {
				id: true,
				label: true,
				scope: true,
				severity: true,
			},
		});

		if (!existingRule) {
			return res.status(404).json({ error: "Moderation rule not found" });
		}

		await prisma.contentModerationRule.delete({
			where: { id },
		});

		await logDeveloperAudit(req.user, {
			action: "MODERATION_RULE_DELETED",
			entityType: "MODERATION_RULE",
			entityId: id,
			entityLabel: existingRule.label,
			summary: `${req.user.fullName} deleted a moderation rule`,
			details: {
				scope: existingRule.scope,
				severity: existingRule.severity,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "MODERATION_RULE_DELETED",
			entityType: "MODERATION_RULE",
			entityId: id,
		});

		return res.status(200).json({ message: "Moderation rule deleted", ruleId: id });
	} catch (error) {
		return handleWorkspaceError(error, res, "deleteDeveloperModerationRule");
	}
};

export const updateDeveloperGroupSettings = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageGroups", "You do not have permission to manage groups");
		const { id: conversationId } = req.params;
		const { title, description, isPrivate, memberLimit } = req.body ?? {};

		const conversation = await getDeveloperGroupConversationById(conversationId, false);
		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const data = {};
		if (typeof title === "string") {
			const normalizedTitle = normalizeText(title, 120);
			if (!normalizedTitle) {
				return res.status(400).json({ error: "Group name is required" });
			}
			data.title = normalizedTitle;
		}

		if (typeof description === "string") {
			data.description = normalizeText(description, 1200);
		}

		if (typeof isPrivate !== "undefined") {
			data.isPrivate = isPrivate === true || isPrivate === "true";
		}

		if (typeof memberLimit !== "undefined") {
			const nextMemberLimit = parseGroupMemberLimit(memberLimit);
			if (Number.isNaN(nextMemberLimit)) {
				return res.status(400).json({ error: "Member limit must be at least 2" });
			}
			if (nextMemberLimit && conversation.members.length > nextMemberLimit) {
				return res.status(400).json({ error: "Member limit cannot be lower than the current members count" });
			}
			data.memberLimit = nextMemberLimit;
		}

		if (Object.keys(data).length === 0) {
			const currentConversation = await getDeveloperGroupConversationById(conversationId, true);
			return res.status(200).json(mapDeveloperGroup(currentConversation, { includeMessages: true }));
		}

		await prisma.conversation.update({
			where: { id: conversationId },
			data,
		});

		const memberIds = conversation.members.map((member) => member.userId);
		await emitGroupConversationUpsert(conversationId, memberIds);
		emitPublicGroupsChanged();

		await logDeveloperAudit(req.user, {
			action: "GROUP_SETTINGS_UPDATED",
			entityType: "GROUP",
			entityId: conversationId,
			entityLabel: data.title || conversation.title || "Untitled group",
			summary: `${req.user.fullName} updated group settings`,
			details: data,
		});
		emitDeveloperWorkspaceRefresh({
			action: "GROUP_SETTINGS_UPDATED",
			entityType: "GROUP",
			entityId: conversationId,
		});

		const updatedConversation = await getDeveloperGroupConversationById(conversationId, true);
		return res.status(200).json(mapDeveloperGroup(updatedConversation, { includeMessages: true }));
	} catch (error) {
		return handleWorkspaceError(error, res, "updateDeveloperGroupSettings");
	}
};

export const addDeveloperGroupMembers = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageGroups", "You do not have permission to manage groups");
		const { id: conversationId } = req.params;
		const { memberIds } = req.body ?? {};

		const conversation = await getDeveloperGroupConversationById(conversationId, false);
		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const currentMemberIds = new Set(conversation.members.map((member) => member.userId));
		const normalizedMemberIds = Array.isArray(memberIds)
			? [...new Set(memberIds.filter((memberId) => typeof memberId === "string" && memberId && !currentMemberIds.has(memberId)))]
			: [];

		if (normalizedMemberIds.length === 0) {
			return res.status(400).json({ error: "Select at least one new member" });
		}

		if (conversation.memberLimit && conversation.members.length + normalizedMemberIds.length > conversation.memberLimit) {
			return res.status(400).json({ error: "Member limit reached" });
		}

		const availableUsers = await getAvailableUsersByIds(normalizedMemberIds);
		if (availableUsers.length !== normalizedMemberIds.length) {
			return res.status(400).json({ error: "One or more selected users are unavailable" });
		}

		await prisma.conversationMember.createMany({
			data: normalizedMemberIds.map((memberId) => ({
				conversationId,
				userId: memberId,
				role: CONVERSATION_MEMBER_ROLES.MEMBER,
				lastReadAt: null,
			})),
		});

		const nextMemberIds = [...conversation.members.map((member) => member.userId), ...normalizedMemberIds];
		await emitGroupConversationUpsert(conversationId, nextMemberIds);
		emitPublicGroupsChanged();

		await logDeveloperAudit(req.user, {
			action: "GROUP_MEMBERS_ADDED",
			entityType: "GROUP",
			entityId: conversationId,
			entityLabel: conversation.title || "Untitled group",
			summary: `${req.user.fullName} added members to a group`,
			details: {
				addedMemberIds: normalizedMemberIds,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "GROUP_MEMBERS_ADDED",
			entityType: "GROUP",
			entityId: conversationId,
		});

		const updatedConversation = await getDeveloperGroupConversationById(conversationId, true);
		return res.status(200).json(mapDeveloperGroup(updatedConversation, { includeMessages: true }));
	} catch (error) {
		return handleWorkspaceError(error, res, "addDeveloperGroupMembers");
	}
};

export const removeDeveloperGroupMember = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageGroups", "You do not have permission to manage groups");
		const { id: conversationId, memberId } = req.params;
		const conversation = await getDeveloperGroupConversationById(conversationId, false);

		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const targetMember = conversation.members.find((member) => member.userId === memberId);
		if (!targetMember) {
			return res.status(404).json({ error: "Member not found" });
		}

		if (targetMember.role === CONVERSATION_MEMBER_ROLES.OWNER) {
			return res.status(400).json({ error: "Transfer ownership before removing the current owner" });
		}

		await prisma.conversationMember.delete({
			where: {
				conversationId_userId: {
					conversationId,
					userId: memberId,
				},
			},
		});

		const remainingMemberIds = conversation.members
			.filter((member) => member.userId !== memberId)
			.map((member) => member.userId);

		await emitGroupSystemMessage({
			conversationId,
			senderId: req.user._id,
			rawMessage: buildGroupMemberRemovedSystemMessage({
				actorName: req.user.fullName,
				targetName: targetMember.user?.fullName,
			}),
			userIds: remainingMemberIds,
		});

		await emitGroupConversationUpsert(conversationId, remainingMemberIds);
		emitPublicGroupsChanged();
		emitGroupConversationRemoved(conversationId, [memberId]);

		await logDeveloperAudit(req.user, {
			action: "GROUP_MEMBER_REMOVED",
			entityType: "GROUP",
			entityId: conversationId,
			entityLabel: conversation.title || "Untitled group",
			summary: `${req.user.fullName} removed ${targetMember.user?.fullName || "a member"} from a group`,
			details: {
				removedMemberId: memberId,
				removedMemberName: targetMember.user?.fullName || null,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "GROUP_MEMBER_REMOVED",
			entityType: "GROUP",
			entityId: conversationId,
		});

		const updatedConversation = await getDeveloperGroupConversationById(conversationId, true);
		return res.status(200).json(mapDeveloperGroup(updatedConversation, { includeMessages: true }));
	} catch (error) {
		return handleWorkspaceError(error, res, "removeDeveloperGroupMember");
	}
};

export const updateDeveloperGroupMemberRole = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageGroups", "You do not have permission to manage groups");
		const { id: conversationId, memberId } = req.params;
		const normalizedRole = typeof req.body?.role === "string" ? req.body.role.trim().toUpperCase() : "";

		if (
			![
				CONVERSATION_MEMBER_ROLES.OWNER,
				CONVERSATION_MEMBER_ROLES.ADMIN,
				CONVERSATION_MEMBER_ROLES.MODERATOR,
				CONVERSATION_MEMBER_ROLES.MEMBER,
			].includes(normalizedRole)
		) {
			return res.status(400).json({ error: "Invalid member role" });
		}

		const conversation = await getDeveloperGroupConversationById(conversationId, false);
		if (!conversation) {
			return res.status(404).json({ error: "Group not found" });
		}

		const targetMember = conversation.members.find((member) => member.userId === memberId);
		if (!targetMember) {
			return res.status(404).json({ error: "Member not found" });
		}

		if (normalizedRole === CONVERSATION_MEMBER_ROLES.OWNER) {
			const currentOwner = conversation.members.find((member) => member.role === CONVERSATION_MEMBER_ROLES.OWNER);
			if (currentOwner?.userId !== memberId) {
				await prisma.$transaction([
					...(currentOwner
						? [
								prisma.conversationMember.update({
									where: {
										conversationId_userId: {
											conversationId,
											userId: currentOwner.userId,
										},
									},
									data: {
										role: CONVERSATION_MEMBER_ROLES.ADMIN,
									},
								}),
						  ]
						: []),
					prisma.conversationMember.update({
						where: {
							conversationId_userId: {
								conversationId,
								userId: memberId,
							},
						},
						data: {
							role: CONVERSATION_MEMBER_ROLES.OWNER,
						},
					}),
					prisma.conversation.update({
						where: { id: conversationId },
						data: { createdById: memberId },
					}),
				]);
			}
		} else {
			if (targetMember.role === CONVERSATION_MEMBER_ROLES.OWNER) {
				return res.status(400).json({ error: "Assign another owner before changing the current owner role" });
			}

			if (targetMember.role !== normalizedRole) {
				await prisma.conversationMember.update({
					where: {
						conversationId_userId: {
							conversationId,
							userId: memberId,
						},
					},
					data: {
						role: normalizedRole,
					},
				});
			}
		}

		await emitGroupConversationUpsert(
			conversationId,
			conversation.members.map((member) => member.userId)
		);
		emitPublicGroupsChanged();

		await logDeveloperAudit(req.user, {
			action: "GROUP_MEMBER_ROLE_UPDATED",
			entityType: "GROUP",
			entityId: conversationId,
			entityLabel: conversation.title || "Untitled group",
			summary: `${req.user.fullName} set a group member role to ${normalizedRole.toLowerCase()}`,
			details: {
				memberId,
				role: normalizedRole,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "GROUP_MEMBER_ROLE_UPDATED",
			entityType: "GROUP",
			entityId: conversationId,
		});

		const updatedConversation = await getDeveloperGroupConversationById(conversationId, true);
		return res.status(200).json(mapDeveloperGroup(updatedConversation, { includeMessages: true }));
	} catch (error) {
		return handleWorkspaceError(error, res, "updateDeveloperGroupMemberRole");
	}
};
