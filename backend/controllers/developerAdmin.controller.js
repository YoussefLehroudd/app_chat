import {
	DATABASE_UNAVAILABLE_MESSAGE,
	isPrismaConnectionError,
	prisma,
} from "../db/prisma.js";
import { createAuditLog } from "../utils/auditLogs.js";
import { buildBroadcastEmail, buildVerificationDecisionEmail } from "../utils/emailTemplates.js";
import { ensureDeveloperPermission } from "../utils/developerPermissions.js";
import { toUserDto } from "../utils/formatters.js";
import {
	emitDeveloperWorkspaceRefresh,
	emitPublicUserUpdated,
	emitSessionUserUpdated,
	emitToUsers,
} from "../utils/realtime.js";
import { sendTransactionalEmail } from "../utils/resend.js";
import { createSecurityEvent } from "../utils/securityEvents.js";

const REPORT_STATUSES = {
	OPEN: "OPEN",
	IN_REVIEW: "IN_REVIEW",
	RESOLVED: "RESOLVED",
	DISMISSED: "DISMISSED",
};

const SUPPORT_TICKET_STATUSES = {
	OPEN: "OPEN",
	IN_PROGRESS: "IN_PROGRESS",
	WAITING_ON_USER: "WAITING_ON_USER",
	RESOLVED: "RESOLVED",
	CLOSED: "CLOSED",
};

const SUPPORT_TICKET_PRIORITIES = {
	LOW: "LOW",
	MEDIUM: "MEDIUM",
	HIGH: "HIGH",
	URGENT: "URGENT",
};

const VERIFICATION_REQUEST_STATUSES = {
	PENDING: "PENDING",
	APPROVED: "APPROVED",
	REJECTED: "REJECTED",
};

const BROADCAST_TYPES = {
	IN_APP: "IN_APP",
	EMAIL: "EMAIL",
	BOTH: "BOTH",
};

const BROADCAST_AUDIENCES = {
	ALL_USERS: "ALL_USERS",
	ACTIVE_USERS: "ACTIVE_USERS",
	VERIFIED_USERS: "VERIFIED_USERS",
	UNVERIFIED_USERS: "UNVERIFIED_USERS",
	DEVELOPERS: "DEVELOPERS",
};

const BROADCAST_STATUSES = {
	DRAFT: "DRAFT",
	SENT: "SENT",
	FAILED: "FAILED",
};

const FEATURE_FLAG_ROLES = new Set(["USER", "DEVELOPER"]);

const developerUserSelect = {
	id: true,
	fullName: true,
	username: true,
	email: true,
	emailVerifiedAt: true,
	role: true,
	isPrimaryDeveloper: true,
	isArchived: true,
	archivedAt: true,
	isBanned: true,
	bannedAt: true,
	bannedReason: true,
	isVerified: true,
	verifiedAt: true,
	twoFactorEnabled: true,
	profilePic: true,
	gender: true,
	bio: true,
	lastSeen: true,
	failedLoginAttempts: true,
	lockedUntil: true,
	createdAt: true,
	updatedAt: true,
};

const handleDeveloperAdminError = (error, res, contextLabel) => {
	console.error(`Error in ${contextLabel}:`, error.message);
	if (isPrismaConnectionError(error)) {
		return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
	}
	return res.status(500).json({ error: "Internal server error" });
};

const logDeveloperAudit = async (actor, entry) => {
	try {
		await createAuditLog({
			actorId: actor?._id || null,
			...entry,
		});
	} catch (error) {
		console.error("Error logging developer admin audit:", error.message);
	}
};

const normalizeText = (value, maxLength = 500) => {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, maxLength);
};

const clampNumber = (value, min, max, fallback = min) => {
	const parsedValue = Number.parseInt(value, 10);
	if (!Number.isFinite(parsedValue)) return fallback;
	return Math.min(max, Math.max(min, parsedValue));
};

const normalizeFeatureFlagKey = (value) =>
	typeof value === "string"
		? value
				.trim()
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-_]/g, "")
				.slice(0, 60)
		: "";

const normalizeRoleList = (value) => {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.map((item) => String(item || "").trim().toUpperCase())
				.filter((item) => FEATURE_FLAG_ROLES.has(item))
		),
	];
};

const normalizeStringArray = (value, maxLength = 120, limit = 8) => {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => normalizeText(item, maxLength)).filter(Boolean))].slice(0, limit);
};

const startOfDay = (value) => {
	const date = new Date(value);
	date.setHours(0, 0, 0, 0);
	return date;
};

const addDays = (value, days) => {
	const date = new Date(value);
	date.setDate(date.getDate() + days);
	return date;
};

const getDateKey = (value) => {
	try {
		return new Date(value).toISOString().slice(0, 10);
	} catch {
		return "";
	}
};

const buildDateSeries = (length, endDate = new Date()) => {
	const days = [];
	for (let index = length - 1; index >= 0; index -= 1) {
		const date = startOfDay(addDays(endDate, -index));
		days.push({
			key: getDateKey(date),
			label: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date),
			date,
		});
	}
	return days;
};

const getLatestUserActivityAt = (user) => {
	const candidates = [user?.lastSeen, user?.sessions?.[0]?.lastSeenAt, user?.sentMessages?.[0]?.createdAt].filter(Boolean);
	if (candidates.length === 0) {
		return null;
	}

	return candidates
		.map((value) => new Date(value))
		.sort((dateA, dateB) => dateB.getTime() - dateA.getTime())[0];
};

const mapSupportTicket = (ticket) => ({
	_id: ticket.id,
	subject: ticket.subject,
	category: ticket.category,
	status: ticket.status,
	priority: ticket.priority,
	details: ticket.details,
	resolutionNote: ticket.resolutionNote ?? "",
	tags: ticket.tags || [],
	closedAt: ticket.closedAt ?? null,
	createdAt: ticket.createdAt,
	updatedAt: ticket.updatedAt,
	createdBy: ticket.createdBy ? toUserDto(ticket.createdBy) : null,
	assignedTo: ticket.assignedTo ? toUserDto(ticket.assignedTo) : null,
	messageCount: ticket.messages?.length || 0,
	messages: (ticket.messages || []).map((message) => ({
		_id: message.id,
		message: message.message,
		isInternal: Boolean(message.isInternal),
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
		author: message.author ? toUserDto(message.author) : null,
	})),
});

const mapVerificationRequest = (request) => ({
	_id: request.id,
	status: request.status,
	requestNote: request.requestNote ?? "",
	reviewNote: request.reviewNote ?? "",
	proofLinks: request.proofLinks || [],
	createdAt: request.createdAt,
	updatedAt: request.updatedAt,
	reviewedAt: request.reviewedAt ?? null,
	user: request.user ? toUserDto(request.user, { includeSensitiveFields: true }) : null,
	requestedBy: request.requestedBy ? toUserDto(request.requestedBy) : null,
	reviewedBy: request.reviewedBy ? toUserDto(request.reviewedBy) : null,
});

const mapSecurityEvent = (event) => ({
	_id: event.id,
	eventType: event.eventType,
	riskLevel: event.riskLevel,
	ipAddress: event.ipAddress ?? "",
	userAgent: event.userAgent ?? "",
	summary: event.summary,
	details: event.details ?? null,
	createdAt: event.createdAt,
	user: event.user ? toUserDto(event.user) : null,
});

const mapBroadcastCampaign = (campaign) => ({
	_id: campaign.id,
	title: campaign.title,
	subject: campaign.subject ?? "",
	content: campaign.content,
	type: campaign.type,
	audienceType: campaign.audienceType,
	status: campaign.status,
	filterJson: campaign.filterJson ?? null,
	audienceCount: campaign.audienceCount ?? 0,
	deliveryCount: campaign.deliveryCount ?? 0,
	emailDeliveryCount: campaign.emailDeliveryCount ?? 0,
	failureReason: campaign.failureReason ?? "",
	sentAt: campaign.sentAt ?? null,
	createdAt: campaign.createdAt,
	updatedAt: campaign.updatedAt,
	createdBy: campaign.createdBy ? toUserDto(campaign.createdBy) : null,
});

const mapFeatureFlag = (flag) => ({
	_id: flag.id,
	key: flag.key,
	name: flag.name,
	description: flag.description ?? "",
	isEnabled: Boolean(flag.isEnabled),
	rolloutPercent: flag.rolloutPercent ?? 0,
	targetRoles: flag.targetRoles || [],
	allowListUserIds: flag.allowListUserIds || [],
	createdAt: flag.createdAt,
	updatedAt: flag.updatedAt,
	createdBy: flag.createdBy ? toUserDto(flag.createdBy) : null,
	updatedBy: flag.updatedBy ? toUserDto(flag.updatedBy) : null,
});

const resolveDeveloperAssignee = async (assignedToId) => {
	const normalizedId = typeof assignedToId === "string" ? assignedToId.trim() : "";
	if (!normalizedId) {
		return null;
	}

	const developer = await prisma.user.findUnique({
		where: { id: normalizedId },
		select: {
			id: true,
			role: true,
			isArchived: true,
			isBanned: true,
		},
	});

	if (!developer || developer.role !== "DEVELOPER" || developer.isArchived || developer.isBanned) {
		const error = new Error("Assigned reviewer must be an active developer");
		error.statusCode = 400;
		throw error;
	}

	return developer.id;
};

const resolveBroadcastAudienceUsers = async (audienceType) => {
	const normalizedAudienceType =
		typeof audienceType === "string" ? audienceType.trim().toUpperCase() : BROADCAST_AUDIENCES.ALL_USERS;
	const baseWhere = {
		isArchived: false,
		isBanned: false,
	};

	if (normalizedAudienceType === BROADCAST_AUDIENCES.ACTIVE_USERS) {
		return prisma.user.findMany({
			where: {
				...baseWhere,
				OR: [
					{ lastSeen: { gte: addDays(new Date(), -7) } },
					{
						sessions: {
							some: {
								revokedAt: null,
								lastSeenAt: { gte: addDays(new Date(), -7) },
							},
						},
					},
				],
			},
			select: developerUserSelect,
		});
	}

	if (normalizedAudienceType === BROADCAST_AUDIENCES.VERIFIED_USERS) {
		return prisma.user.findMany({
			where: {
				...baseWhere,
				isVerified: true,
			},
			select: developerUserSelect,
		});
	}

	if (normalizedAudienceType === BROADCAST_AUDIENCES.UNVERIFIED_USERS) {
		return prisma.user.findMany({
			where: {
				...baseWhere,
				isVerified: false,
			},
			select: developerUserSelect,
		});
	}

	if (normalizedAudienceType === BROADCAST_AUDIENCES.DEVELOPERS) {
		return prisma.user.findMany({
			where: {
				...baseWhere,
				role: "DEVELOPER",
			},
			select: developerUserSelect,
		});
	}

	return prisma.user.findMany({
		where: baseWhere,
		select: developerUserSelect,
	});
};

export const getDeveloperAnalytics = async (req, res) => {
	try {
		const now = new Date();
		const seriesDays = buildDateSeries(14, now);
		const seriesStart = seriesDays[0]?.date || startOfDay(now);
		const todayStart = startOfDay(now);
		const weekStart = addDays(todayStart, -6);

		const [recentMessages, recentSignups, recentSeenUsers, recentReports, recentTickets, cohortUsers, lockedAccounts] =
			await Promise.all([
				prisma.message.findMany({
					where: { createdAt: { gte: seriesStart } },
					select: { createdAt: true, senderId: true },
				}),
				prisma.user.findMany({
					where: { createdAt: { gte: seriesStart } },
					select: { createdAt: true },
				}),
				prisma.user.findMany({
					where: {
						OR: [
							{ lastSeen: { gte: seriesStart } },
							{
								sentMessages: {
									some: {
										createdAt: { gte: seriesStart },
									},
								},
							},
						],
					},
					select: {
						id: true,
						lastSeen: true,
					},
				}),
				prisma.report.findMany({
					where: { createdAt: { gte: seriesStart } },
					select: { status: true },
				}),
				prisma.supportTicket.findMany({
					where: { createdAt: { gte: seriesStart } },
					select: { status: true },
				}),
				prisma.user.findMany({
					where: { createdAt: { gte: addDays(now, -60) } },
					select: {
						id: true,
						createdAt: true,
						lastSeen: true,
						sessions: {
							orderBy: { lastSeenAt: "desc" },
							take: 1,
							select: { lastSeenAt: true },
						},
						sentMessages: {
							orderBy: { createdAt: "desc" },
							take: 1,
							select: { createdAt: true },
						},
					},
				}),
				prisma.user.count({
					where: {
						lockedUntil: { gt: now },
					},
				}),
			]);

		const dailyMessageCounts = new Map(seriesDays.map((day) => [day.key, 0]));
		const dailySignupCounts = new Map(seriesDays.map((day) => [day.key, 0]));
		const activeUserSetsByDay = new Map(seriesDays.map((day) => [day.key, new Set()]));
		const activeUsersToday = new Set();
		const activeUsersThisWeek = new Set();

		recentMessages.forEach((message) => {
			const key = getDateKey(message.createdAt);
			if (dailyMessageCounts.has(key)) {
				dailyMessageCounts.set(key, (dailyMessageCounts.get(key) || 0) + 1);
				activeUserSetsByDay.get(key)?.add(message.senderId);
			}

			const createdAtTime = new Date(message.createdAt).getTime();
			if (createdAtTime >= todayStart.getTime()) {
				activeUsersToday.add(message.senderId);
			}
			if (createdAtTime >= weekStart.getTime()) {
				activeUsersThisWeek.add(message.senderId);
			}
		});

		recentSignups.forEach((user) => {
			const key = getDateKey(user.createdAt);
			if (dailySignupCounts.has(key)) {
				dailySignupCounts.set(key, (dailySignupCounts.get(key) || 0) + 1);
			}
		});

		recentSeenUsers.forEach((user) => {
			if (!user.lastSeen) return;
			const key = getDateKey(user.lastSeen);
			if (activeUserSetsByDay.has(key)) {
				activeUserSetsByDay.get(key)?.add(user.id);
			}

			const lastSeenTime = new Date(user.lastSeen).getTime();
			if (lastSeenTime >= todayStart.getTime()) {
				activeUsersToday.add(user.id);
			}
			if (lastSeenTime >= weekStart.getTime()) {
				activeUsersThisWeek.add(user.id);
			}
		});

		const sevenDayCohort = cohortUsers.filter((user) => {
			const createdAt = new Date(user.createdAt).getTime();
			return createdAt >= addDays(now, -14).getTime() && createdAt < addDays(now, -7).getTime();
		});
		const thirtyDayCohort = cohortUsers.filter((user) => {
			const createdAt = new Date(user.createdAt).getTime();
			return createdAt >= addDays(now, -60).getTime() && createdAt < addDays(now, -30).getTime();
		});

		const retainedSevenDayUsers = sevenDayCohort.filter((user) => {
			const latestActivity = getLatestUserActivityAt(user);
			return latestActivity && latestActivity.getTime() >= addDays(user.createdAt, 7).getTime();
		}).length;
		const retainedThirtyDayUsers = thirtyDayCohort.filter((user) => {
			const latestActivity = getLatestUserActivityAt(user);
			return latestActivity && latestActivity.getTime() >= addDays(user.createdAt, 30).getTime();
		}).length;

		const messagesToday = recentMessages.filter((message) => new Date(message.createdAt).getTime() >= todayStart.getTime()).length;
		const averageMessagesPerDay = Math.round((recentMessages.length / Math.max(seriesDays.length, 1)) * 10) / 10;

		return res.status(200).json({
			kpis: {
				dau: activeUsersToday.size,
				wau: activeUsersThisWeek.size,
				messagesToday,
				averageMessagesPerDay,
				newUsersToday: recentSignups.filter((user) => new Date(user.createdAt).getTime() >= todayStart.getTime()).length,
				retention7d:
					sevenDayCohort.length > 0 ? Math.round((retainedSevenDayUsers / sevenDayCohort.length) * 100) : 0,
				retention30d:
					thirtyDayCohort.length > 0 ? Math.round((retainedThirtyDayUsers / thirtyDayCohort.length) * 100) : 0,
				openReports: recentReports.filter((report) => report.status === REPORT_STATUSES.OPEN).length,
				openTickets: recentTickets.filter((ticket) => ticket.status === SUPPORT_TICKET_STATUSES.OPEN).length,
				lockedAccounts,
			},
			series: {
				messages: seriesDays.map((day) => ({
					label: day.label,
					date: day.key,
					count: dailyMessageCounts.get(day.key) || 0,
				})),
				signups: seriesDays.map((day) => ({
					label: day.label,
					date: day.key,
					count: dailySignupCounts.get(day.key) || 0,
				})),
				activeUsers: seriesDays.map((day) => ({
					label: day.label,
					date: day.key,
					count: activeUserSetsByDay.get(day.key)?.size || 0,
				})),
			},
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperAnalytics");
	}
};

export const getDeveloperUserInsights = async (req, res) => {
	try {
		const { id } = req.params;
		const [user, reportsCreated, reportsAgainst, groupMemberships, sessions, auditLogs, securityEvents, verificationRequests] =
			await Promise.all([
				prisma.user.findUnique({
					where: { id },
					select: {
						...developerUserSelect,
						_count: {
							select: {
								sentMessages: true,
								createdReports: true,
								targetedReports: true,
								sessions: true,
							},
						},
					},
				}),
				prisma.report.findMany({
					where: { createdById: id },
					orderBy: { createdAt: "desc" },
					take: 8,
					select: {
						id: true,
						status: true,
						priority: true,
						reason: true,
						targetLabel: true,
						createdAt: true,
						updatedAt: true,
					},
				}),
				prisma.report.findMany({
					where: { targetUserId: id },
					orderBy: { createdAt: "desc" },
					take: 8,
					select: {
						id: true,
						status: true,
						priority: true,
						reason: true,
						targetLabel: true,
						createdAt: true,
						updatedAt: true,
					},
				}),
				prisma.conversationMember.findMany({
					where: {
						userId: id,
						conversation: {
							type: "GROUP",
						},
					},
					orderBy: { joinedAt: "desc" },
					take: 12,
					select: {
						role: true,
						joinedAt: true,
						conversation: {
							select: {
								id: true,
								title: true,
								isPrivate: true,
								profilePic: true,
								updatedAt: true,
								_count: {
									select: {
										members: true,
										messages: true,
									},
								},
							},
						},
					},
				}),
				prisma.userSession.findMany({
					where: { userId: id },
					orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }, { createdAt: "desc" }],
					take: 10,
					select: {
						id: true,
						sessionTokenId: true,
						userAgent: true,
						ipAddress: true,
						lastSeenAt: true,
						revokedAt: true,
						createdAt: true,
						updatedAt: true,
					},
				}),
				prisma.auditLog.findMany({
					where: {
						entityType: "USER",
						entityId: id,
					},
					orderBy: { createdAt: "desc" },
					take: 16,
					include: {
						actor: {
							select: developerUserSelect,
						},
					},
				}),
				prisma.securityEvent.findMany({
					where: { userId: id },
					orderBy: { createdAt: "desc" },
					take: 16,
					include: {
						user: {
							select: developerUserSelect,
						},
					},
				}),
				prisma.verificationRequest.findMany({
					where: { userId: id },
					orderBy: { createdAt: "desc" },
					take: 6,
					include: {
						user: { select: developerUserSelect },
						requestedBy: { select: developerUserSelect },
						reviewedBy: { select: developerUserSelect },
					},
				}),
			]);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		return res.status(200).json({
			user: toUserDto(user, { includeDeveloperPermissions: true, includeSensitiveFields: true }),
			counts: {
				sentMessages: user._count?.sentMessages || 0,
				groupMemberships: groupMemberships.length,
				reportsCreated: user._count?.createdReports || 0,
				reportsAgainst: user._count?.targetedReports || 0,
				sessionCount: user._count?.sessions || 0,
				failedLoginAttempts: user.failedLoginAttempts || 0,
			},
			groups: groupMemberships.map((membership) => ({
				_id: membership.conversation.id,
				title: membership.conversation.title || "Untitled group",
				isPrivate: Boolean(membership.conversation.isPrivate),
				profilePic: membership.conversation.profilePic || "",
				memberCount: membership.conversation._count?.members || 0,
				messageCount: membership.conversation._count?.messages || 0,
				memberRole: membership.role,
				joinedAt: membership.joinedAt,
				updatedAt: membership.conversation.updatedAt,
			})),
			reportsCreated,
			reportsAgainst,
			sessions,
			auditTrail: auditLogs.map((log) => ({
				_id: log.id,
				action: log.action,
				summary: log.summary,
				details: log.details ?? null,
				createdAt: log.createdAt,
				actor: log.actor ? toUserDto(log.actor) : null,
			})),
			securityEvents: securityEvents.map(mapSecurityEvent),
			verificationRequests: verificationRequests.map(mapVerificationRequest),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperUserInsights");
	}
};

export const getDeveloperSupportTickets = async (req, res) => {
	try {
		const tickets = await prisma.supportTicket.findMany({
			orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
			include: {
				createdBy: { select: developerUserSelect },
				assignedTo: { select: developerUserSelect },
				messages: {
					orderBy: { createdAt: "asc" },
					include: {
						author: { select: developerUserSelect },
					},
				},
			},
		});

		return res.status(200).json(tickets.map(mapSupportTicket));
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperSupportTickets");
	}
};

export const createDeveloperSupportTicket = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to manage support tickets");
		const subject = normalizeText(req.body?.subject, 160);
		const details = normalizeText(req.body?.details, 2400);
		const category = normalizeText(req.body?.category, 60) || "GENERAL";
		const status =
			typeof req.body?.status === "string" &&
			Object.values(SUPPORT_TICKET_STATUSES).includes(req.body.status.trim().toUpperCase())
				? req.body.status.trim().toUpperCase()
				: SUPPORT_TICKET_STATUSES.OPEN;
		const priority =
			typeof req.body?.priority === "string" &&
			Object.values(SUPPORT_TICKET_PRIORITIES).includes(req.body.priority.trim().toUpperCase())
				? req.body.priority.trim().toUpperCase()
				: SUPPORT_TICKET_PRIORITIES.MEDIUM;
		const assignedToId = await resolveDeveloperAssignee(req.body?.assignedToId);
		const tags = normalizeStringArray(req.body?.tags, 32, 6);

		if (!subject || !details) {
			return res.status(400).json({ error: "Ticket subject and details are required" });
		}

		const ticket = await prisma.supportTicket.create({
			data: {
				createdById: req.user._id,
				assignedToId,
				subject,
				category,
				status,
				priority,
				details,
				tags,
				messages: {
					create: {
						authorId: req.user._id,
						message: details,
						isInternal: true,
					},
				},
			},
			include: {
				createdBy: { select: developerUserSelect },
				assignedTo: { select: developerUserSelect },
				messages: {
					orderBy: { createdAt: "asc" },
					include: {
						author: { select: developerUserSelect },
					},
				},
			},
		});

		await logDeveloperAudit(req.user, {
			action: "SUPPORT_TICKET_CREATED",
			entityType: "SUPPORT_TICKET",
			entityId: ticket.id,
			entityLabel: ticket.subject,
			summary: `${req.user.fullName} created a support ticket`,
			details: { category, priority, status, assignedToId },
		});
		emitDeveloperWorkspaceRefresh({
			action: "SUPPORT_TICKET_CREATED",
			entityType: "SUPPORT_TICKET",
			entityId: ticket.id,
		});

		return res.status(201).json({
			message: "Support ticket created",
			ticket: mapSupportTicket(ticket),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperAdminError(error, res, "createDeveloperSupportTicket");
	}
};

export const updateDeveloperSupportTicket = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to manage support tickets");
		const { id } = req.params;
		const existingTicket = await prisma.supportTicket.findUnique({
			where: { id },
			include: {
				createdBy: { select: developerUserSelect },
				assignedTo: { select: developerUserSelect },
				messages: {
					orderBy: { createdAt: "asc" },
					include: {
						author: { select: developerUserSelect },
					},
				},
			},
		});

		if (!existingTicket) {
			return res.status(404).json({ error: "Support ticket not found" });
		}

		const nextStatus =
			typeof req.body?.status === "string" &&
			Object.values(SUPPORT_TICKET_STATUSES).includes(req.body.status.trim().toUpperCase())
				? req.body.status.trim().toUpperCase()
				: existingTicket.status;
		const nextPriority =
			typeof req.body?.priority === "string" &&
			Object.values(SUPPORT_TICKET_PRIORITIES).includes(req.body.priority.trim().toUpperCase())
				? req.body.priority.trim().toUpperCase()
				: existingTicket.priority;
		const nextAssignedToId = Object.prototype.hasOwnProperty.call(req.body || {}, "assignedToId")
			? await resolveDeveloperAssignee(req.body?.assignedToId)
			: existingTicket.assignedToId || null;
		const nextResolutionNote =
			typeof req.body?.resolutionNote === "string"
				? normalizeText(req.body.resolutionNote, 1800) || null
				: existingTicket.resolutionNote;
		const nextCategory =
			typeof req.body?.category === "string" ? normalizeText(req.body.category, 60) || "GENERAL" : existingTicket.category;
		const nextTags = Array.isArray(req.body?.tags) ? normalizeStringArray(req.body.tags, 32, 6) : existingTicket.tags;

		const ticket = await prisma.supportTicket.update({
			where: { id },
			data: {
				status: nextStatus,
				priority: nextPriority,
				assignedToId: nextAssignedToId,
				resolutionNote: nextResolutionNote,
				category: nextCategory,
				tags: nextTags,
				closedAt:
					nextStatus === SUPPORT_TICKET_STATUSES.RESOLVED || nextStatus === SUPPORT_TICKET_STATUSES.CLOSED
						? new Date()
						: null,
			},
			include: {
				createdBy: { select: developerUserSelect },
				assignedTo: { select: developerUserSelect },
				messages: {
					orderBy: { createdAt: "asc" },
					include: {
						author: { select: developerUserSelect },
					},
				},
			},
		});

		await logDeveloperAudit(req.user, {
			action: "SUPPORT_TICKET_UPDATED",
			entityType: "SUPPORT_TICKET",
			entityId: ticket.id,
			entityLabel: ticket.subject,
			summary: `${req.user.fullName} updated a support ticket`,
			details: {
				previousStatus: existingTicket.status,
				nextStatus,
				previousPriority: existingTicket.priority,
				nextPriority,
				previousAssignedToId: existingTicket.assignedToId || null,
				nextAssignedToId,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "SUPPORT_TICKET_UPDATED",
			entityType: "SUPPORT_TICKET",
			entityId: ticket.id,
		});

		return res.status(200).json({
			message: "Support ticket updated",
			ticket: mapSupportTicket(ticket),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperAdminError(error, res, "updateDeveloperSupportTicket");
	}
};

export const addDeveloperSupportTicketMessage = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageReports", "You do not have permission to manage support tickets");
		const { id } = req.params;
		const message = normalizeText(req.body?.message, 3000);
		const isInternal = req.body?.isInternal === true || req.body?.isInternal === "true";

		if (!message) {
			return res.status(400).json({ error: "Ticket message is required" });
		}

		const existingTicket = await prisma.supportTicket.findUnique({
			where: { id },
			select: { id: true, subject: true },
		});

		if (!existingTicket) {
			return res.status(404).json({ error: "Support ticket not found" });
		}

		await prisma.supportTicketMessage.create({
			data: {
				ticketId: id,
				authorId: req.user._id,
				message,
				isInternal,
			},
		});

		const ticket = await prisma.supportTicket.findUnique({
			where: { id },
			include: {
				createdBy: { select: developerUserSelect },
				assignedTo: { select: developerUserSelect },
				messages: {
					orderBy: { createdAt: "asc" },
					include: {
						author: { select: developerUserSelect },
					},
				},
			},
		});

		await logDeveloperAudit(req.user, {
			action: "SUPPORT_TICKET_MESSAGE_ADDED",
			entityType: "SUPPORT_TICKET",
			entityId: id,
			entityLabel: existingTicket.subject,
			summary: `${req.user.fullName} added a support ticket note`,
			details: { isInternal },
		});
		emitDeveloperWorkspaceRefresh({
			action: "SUPPORT_TICKET_MESSAGE_ADDED",
			entityType: "SUPPORT_TICKET",
			entityId: id,
		});

		return res.status(200).json({
			message: "Ticket note added",
			ticket: mapSupportTicket(ticket),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "addDeveloperSupportTicketMessage");
	}
};

export const getDeveloperVerificationRequests = async (req, res) => {
	try {
		const [requests, eligibleUsers] = await Promise.all([
			prisma.verificationRequest.findMany({
				orderBy: [{ status: "asc" }, { createdAt: "desc" }],
				include: {
					user: { select: developerUserSelect },
					requestedBy: { select: developerUserSelect },
					reviewedBy: { select: developerUserSelect },
				},
			}),
			prisma.user.findMany({
				where: {
					isArchived: false,
					isBanned: false,
					isVerified: false,
					emailVerifiedAt: { not: null },
				},
				orderBy: { createdAt: "desc" },
				take: 12,
				select: developerUserSelect,
			}),
		]);

		return res.status(200).json({
			requests: requests.map(mapVerificationRequest),
			eligibleUsers: eligibleUsers.map((user) => toUserDto(user, { includeSensitiveFields: true })),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperVerificationRequests");
	}
};

export const createDeveloperVerificationRequest = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to manage verification requests");
		const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
		const requestNote = normalizeText(req.body?.requestNote, 1800);
		const proofLinks = normalizeStringArray(req.body?.proofLinks, 280, 6);

		if (!userId) {
			return res.status(400).json({ error: "User is required" });
		}

		const targetUser = await prisma.user.findUnique({
			where: { id: userId },
			select: developerUserSelect,
		});

		if (!targetUser || targetUser.isArchived || targetUser.isBanned) {
			return res.status(404).json({ error: "User not found" });
		}

		const pendingRequest = await prisma.verificationRequest.findFirst({
			where: {
				userId,
				status: VERIFICATION_REQUEST_STATUSES.PENDING,
			},
		});

		if (pendingRequest) {
			return res.status(400).json({ error: "A pending verification request already exists for this user" });
		}

		const request = await prisma.verificationRequest.create({
			data: {
				userId,
				requestedById: req.user._id,
				requestNote: requestNote || null,
				proofLinks,
			},
			include: {
				user: { select: developerUserSelect },
				requestedBy: { select: developerUserSelect },
				reviewedBy: { select: developerUserSelect },
			},
		});

		await logDeveloperAudit(req.user, {
			action: "VERIFICATION_REQUEST_CREATED",
			entityType: "VERIFICATION_REQUEST",
			entityId: request.id,
			entityLabel: `${targetUser.fullName} (@${targetUser.username})`,
			summary: `${req.user.fullName} opened a verification review request`,
			details: { userId, proofLinksCount: proofLinks.length },
		});
		emitDeveloperWorkspaceRefresh({
			action: "VERIFICATION_REQUEST_CREATED",
			entityType: "VERIFICATION_REQUEST",
			entityId: request.id,
		});

		return res.status(201).json({
			message: "Verification request created",
			request: mapVerificationRequest(request),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "createDeveloperVerificationRequest");
	}
};

export const updateDeveloperVerificationRequest = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "manageUsers", "You do not have permission to manage verification requests");
		const { id } = req.params;
		const status = typeof req.body?.status === "string" ? req.body.status.trim().toUpperCase() : "";
		const reviewNote = normalizeText(req.body?.reviewNote, 1800);

		if (!Object.values(VERIFICATION_REQUEST_STATUSES).includes(status)) {
			return res.status(400).json({ error: "Invalid verification request status" });
		}

		const existingRequest = await prisma.verificationRequest.findUnique({
			where: { id },
			include: {
				user: { select: developerUserSelect },
				requestedBy: { select: developerUserSelect },
				reviewedBy: { select: developerUserSelect },
			},
		});

		if (!existingRequest) {
			return res.status(404).json({ error: "Verification request not found" });
		}

		const request = await prisma.verificationRequest.update({
			where: { id },
			data: {
				status,
				reviewNote: reviewNote || null,
				reviewedById: req.user._id,
				reviewedAt: new Date(),
			},
			include: {
				user: { select: developerUserSelect },
				requestedBy: { select: developerUserSelect },
				reviewedBy: { select: developerUserSelect },
			},
		});

		let updatedUser = existingRequest.user;
		if (status === VERIFICATION_REQUEST_STATUSES.APPROVED) {
			updatedUser = await prisma.user.update({
				where: { id: existingRequest.userId },
				data: {
					isVerified: true,
					verifiedAt: new Date(),
				},
			});
			emitSessionUserUpdated(updatedUser);
			emitPublicUserUpdated(updatedUser);
			await createSecurityEvent({
				userId: updatedUser.id,
				eventType: "VERIFIED_BADGE_GRANTED",
				riskLevel: "LOW",
				summary: "Verified badge granted by the moderation team",
				details: {
					reviewedById: req.user._id,
					requestId: id,
				},
			});
		}

		if (existingRequest.user?.email) {
			try {
				const emailContent = buildVerificationDecisionEmail({
					fullName: existingRequest.user.fullName,
					isApproved: status === VERIFICATION_REQUEST_STATUSES.APPROVED,
					reviewNote: reviewNote || "",
				});
				await sendTransactionalEmail({
					to: existingRequest.user.email,
					subject: emailContent.subject,
					html: emailContent.html,
					text: emailContent.text,
				});
			} catch (emailError) {
				console.warn("Skipped verification decision email:", emailError.message);
			}
		}

		await logDeveloperAudit(req.user, {
			action:
				status === VERIFICATION_REQUEST_STATUSES.APPROVED
					? "VERIFICATION_REQUEST_APPROVED"
					: "VERIFICATION_REQUEST_REJECTED",
			entityType: "VERIFICATION_REQUEST",
			entityId: request.id,
			entityLabel: `${existingRequest.user?.fullName || "Unknown user"} (@${existingRequest.user?.username || "unknown"})`,
			summary: `${req.user.fullName} ${status === VERIFICATION_REQUEST_STATUSES.APPROVED ? "approved" : "rejected"} a verification request`,
			details: {
				reviewNote: reviewNote || null,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action:
				status === VERIFICATION_REQUEST_STATUSES.APPROVED
					? "VERIFICATION_REQUEST_APPROVED"
					: "VERIFICATION_REQUEST_REJECTED",
			entityType: "VERIFICATION_REQUEST",
			entityId: request.id,
		});

		return res.status(200).json({
			message:
				status === VERIFICATION_REQUEST_STATUSES.APPROVED
					? "Verification request approved"
					: "Verification request rejected",
			request: mapVerificationRequest({
				...request,
				user: updatedUser || request.user,
			}),
			user: updatedUser ? toUserDto(updatedUser) : null,
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "updateDeveloperVerificationRequest");
	}
};

export const getDeveloperSecurityOverview = async (req, res) => {
	try {
		const now = new Date();
		const sevenDaysAgo = addDays(now, -7);
		const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

		const [events, lockedUsers, activeSessions] = await Promise.all([
			prisma.securityEvent.findMany({
				where: { createdAt: { gte: sevenDaysAgo } },
				orderBy: { createdAt: "desc" },
				take: 120,
				include: {
					user: { select: developerUserSelect },
				},
			}),
			prisma.user.findMany({
				where: { lockedUntil: { gt: now } },
				orderBy: { lockedUntil: "desc" },
				select: developerUserSelect,
			}),
			prisma.userSession.findMany({
				where: { revokedAt: null },
				orderBy: { lastSeenAt: "desc" },
				take: 80,
				include: {
					user: { select: developerUserSelect },
				},
			}),
		]);

		const suspiciousIpMap = new Map();
		const failedLoginsByUser = new Map();
		events.forEach((event) => {
			if (event.ipAddress) {
				suspiciousIpMap.set(event.ipAddress, {
					ipAddress: event.ipAddress,
					count: (suspiciousIpMap.get(event.ipAddress)?.count || 0) + 1,
					riskLevel: event.riskLevel,
				});
			}

			if (event.eventType === "FAILED_LOGIN" && event.userId) {
				const existingValue = failedLoginsByUser.get(event.userId) || {
					user: event.user ? toUserDto(event.user) : null,
					count: 0,
				};
				existingValue.count += 1;
				failedLoginsByUser.set(event.userId, existingValue);
			}
		});

		return res.status(200).json({
			kpis: {
				failedLogins24h: events.filter(
					(event) =>
						event.eventType === "FAILED_LOGIN" && new Date(event.createdAt).getTime() >= twentyFourHoursAgo.getTime()
				).length,
				suspiciousEvents7d: events.filter(
					(event) => event.eventType === "SUSPICIOUS_IP" || event.riskLevel === "HIGH" || event.riskLevel === "CRITICAL"
				).length,
				activeSessions: activeSessions.length,
				lockedAccounts: lockedUsers.length,
			},
			recentEvents: events.map(mapSecurityEvent),
			lockedAccounts: lockedUsers.map((user) => toUserDto(user, { includeSensitiveFields: true })),
			suspiciousIps: Array.from(suspiciousIpMap.values()).sort((entryA, entryB) => entryB.count - entryA.count).slice(0, 8),
			failedLoginTargets: Array.from(failedLoginsByUser.values()).sort((entryA, entryB) => entryB.count - entryA.count).slice(0, 8),
			activeSessions: activeSessions.map((session) => ({
				_id: session.id,
				sessionTokenId: session.sessionTokenId,
				userAgent: session.userAgent || "",
				ipAddress: session.ipAddress || "",
				lastSeenAt: session.lastSeenAt,
				createdAt: session.createdAt,
				user: session.user ? toUserDto(session.user) : null,
			})),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperSecurityOverview");
	}
};

export const getDeveloperBroadcasts = async (req, res) => {
	try {
		const campaigns = await prisma.broadcastCampaign.findMany({
			orderBy: { createdAt: "desc" },
			include: {
				createdBy: { select: developerUserSelect },
			},
		});

		return res.status(200).json(campaigns.map(mapBroadcastCampaign));
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperBroadcasts");
	}
};

export const createDeveloperBroadcast = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "fullAccess", "You do not have permission to send broadcasts");
		const title = normalizeText(req.body?.title, 140);
		const subject = normalizeText(req.body?.subject, 180);
		const content = normalizeText(req.body?.content, 6000);
		const type =
			typeof req.body?.type === "string" && Object.values(BROADCAST_TYPES).includes(req.body.type.trim().toUpperCase())
				? req.body.type.trim().toUpperCase()
				: BROADCAST_TYPES.IN_APP;
		const audienceType =
			typeof req.body?.audienceType === "string" &&
			Object.values(BROADCAST_AUDIENCES).includes(req.body.audienceType.trim().toUpperCase())
				? req.body.audienceType.trim().toUpperCase()
				: BROADCAST_AUDIENCES.ALL_USERS;

		if (!title || !content) {
			return res.status(400).json({ error: "Broadcast title and content are required" });
		}

		const audienceUsers = await resolveBroadcastAudienceUsers(audienceType);
		const audienceUserIds = audienceUsers.map((user) => user.id);
		let deliveryCount = 0;
		let emailDeliveryCount = 0;
		let failureReason = null;
		let campaignStatus = BROADCAST_STATUSES.SENT;

		if (type === BROADCAST_TYPES.IN_APP || type === BROADCAST_TYPES.BOTH) {
			emitToUsers(audienceUserIds, "developerBroadcast", {
				title,
				content,
				sentAt: new Date().toISOString(),
				audienceType,
			});
			deliveryCount = audienceUserIds.length;
		}

		if (type === BROADCAST_TYPES.EMAIL || type === BROADCAST_TYPES.BOTH) {
			const emailUsers = audienceUsers.filter((user) => user.email);
			if (emailUsers.length > 0) {
				const emailResults = await Promise.allSettled(
					emailUsers.map((user) => {
						const emailContent = buildBroadcastEmail({
							fullName: user.fullName,
							title,
							content,
						});
						return sendTransactionalEmail({
							to: user.email,
							subject: subject || emailContent.subject,
							html: emailContent.html,
							text: emailContent.text,
						});
					})
				);
				emailDeliveryCount = emailResults.filter((result) => result.status === "fulfilled").length;
				if (emailDeliveryCount === 0 && emailUsers.length > 0) {
					campaignStatus = deliveryCount > 0 ? BROADCAST_STATUSES.SENT : BROADCAST_STATUSES.FAILED;
					failureReason = "Email delivery failed for all selected recipients";
				}
			}
		}

		const campaign = await prisma.broadcastCampaign.create({
			data: {
				createdById: req.user._id,
				title,
				subject: subject || null,
				content,
				type,
				audienceType,
				status: campaignStatus,
				audienceCount: audienceUsers.length,
				deliveryCount,
				emailDeliveryCount,
				failureReason,
				sentAt: new Date(),
			},
			include: {
				createdBy: { select: developerUserSelect },
			},
		});

		await logDeveloperAudit(req.user, {
			action: "BROADCAST_SENT",
			entityType: "BROADCAST",
			entityId: campaign.id,
			entityLabel: campaign.title,
			summary: `${req.user.fullName} sent a platform broadcast`,
			details: {
				type,
				audienceType,
				audienceCount: audienceUsers.length,
				deliveryCount,
				emailDeliveryCount,
				failureReason,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "BROADCAST_SENT",
			entityType: "BROADCAST",
			entityId: campaign.id,
		});

		return res.status(201).json({
			message: "Broadcast sent",
			campaign: mapBroadcastCampaign(campaign),
		});
	} catch (error) {
		if (error.statusCode) {
			return res.status(error.statusCode).json({ error: error.message });
		}
		return handleDeveloperAdminError(error, res, "createDeveloperBroadcast");
	}
};

export const getDeveloperFeatureFlags = async (req, res) => {
	try {
		const flags = await prisma.featureFlag.findMany({
			orderBy: [{ isEnabled: "desc" }, { updatedAt: "desc" }],
			include: {
				createdBy: { select: developerUserSelect },
				updatedBy: { select: developerUserSelect },
			},
		});

		return res.status(200).json(flags.map(mapFeatureFlag));
	} catch (error) {
		return handleDeveloperAdminError(error, res, "getDeveloperFeatureFlags");
	}
};

export const createDeveloperFeatureFlag = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "fullAccess", "You do not have permission to manage feature flags");
		const key = normalizeFeatureFlagKey(req.body?.key);
		const name = normalizeText(req.body?.name, 120);
		const description = normalizeText(req.body?.description, 1200);
		const rolloutPercent = clampNumber(req.body?.rolloutPercent, 0, 100, 0);
		const isEnabled = req.body?.isEnabled === true || req.body?.isEnabled === "true";
		const targetRoles = normalizeRoleList(req.body?.targetRoles);
		const allowListUserIds = normalizeStringArray(req.body?.allowListUserIds, 64, 50);

		if (!key || !name) {
			return res.status(400).json({ error: "Feature flag key and name are required" });
		}

		const flag = await prisma.featureFlag.create({
			data: {
				key,
				name,
				description: description || "",
				rolloutPercent,
				isEnabled,
				targetRoles,
				allowListUserIds,
				createdById: req.user._id,
				updatedById: req.user._id,
			},
			include: {
				createdBy: { select: developerUserSelect },
				updatedBy: { select: developerUserSelect },
			},
		});

		await logDeveloperAudit(req.user, {
			action: "FEATURE_FLAG_CREATED",
			entityType: "FEATURE_FLAG",
			entityId: flag.id,
			entityLabel: flag.key,
			summary: `${req.user.fullName} created a feature flag`,
			details: {
				rolloutPercent,
				isEnabled,
				targetRoles,
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "FEATURE_FLAG_CREATED",
			entityType: "FEATURE_FLAG",
			entityId: flag.id,
		});

		return res.status(201).json({
			message: "Feature flag created",
			flag: mapFeatureFlag(flag),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "createDeveloperFeatureFlag");
	}
};

export const updateDeveloperFeatureFlag = async (req, res) => {
	try {
		ensureDeveloperPermission(req.user, "fullAccess", "You do not have permission to manage feature flags");
		const { id } = req.params;
		const existingFlag = await prisma.featureFlag.findUnique({
			where: { id },
			include: {
				createdBy: { select: developerUserSelect },
				updatedBy: { select: developerUserSelect },
			},
		});

		if (!existingFlag) {
			return res.status(404).json({ error: "Feature flag not found" });
		}

		const nextFlag = await prisma.featureFlag.update({
			where: { id },
			data: {
				name: typeof req.body?.name === "string" ? normalizeText(req.body.name, 120) || existingFlag.name : existingFlag.name,
				description:
					typeof req.body?.description === "string"
						? normalizeText(req.body.description, 1200)
						: existingFlag.description,
				isEnabled:
					typeof req.body?.isEnabled !== "undefined"
						? req.body.isEnabled === true || req.body.isEnabled === "true"
						: existingFlag.isEnabled,
				rolloutPercent:
					typeof req.body?.rolloutPercent !== "undefined"
						? clampNumber(req.body.rolloutPercent, 0, 100, existingFlag.rolloutPercent)
						: existingFlag.rolloutPercent,
				targetRoles: Array.isArray(req.body?.targetRoles) ? normalizeRoleList(req.body.targetRoles) : existingFlag.targetRoles,
				allowListUserIds: Array.isArray(req.body?.allowListUserIds)
					? normalizeStringArray(req.body.allowListUserIds, 64, 50)
					: existingFlag.allowListUserIds,
				updatedById: req.user._id,
			},
			include: {
				createdBy: { select: developerUserSelect },
				updatedBy: { select: developerUserSelect },
			},
		});

		await logDeveloperAudit(req.user, {
			action: "FEATURE_FLAG_UPDATED",
			entityType: "FEATURE_FLAG",
			entityId: nextFlag.id,
			entityLabel: nextFlag.key,
			summary: `${req.user.fullName} updated a feature flag`,
			details: {
				previous: {
					isEnabled: existingFlag.isEnabled,
					rolloutPercent: existingFlag.rolloutPercent,
				},
				next: {
					isEnabled: nextFlag.isEnabled,
					rolloutPercent: nextFlag.rolloutPercent,
				},
			},
		});
		emitDeveloperWorkspaceRefresh({
			action: "FEATURE_FLAG_UPDATED",
			entityType: "FEATURE_FLAG",
			entityId: nextFlag.id,
		});

		return res.status(200).json({
			message: "Feature flag updated",
			flag: mapFeatureFlag(nextFlag),
		});
	} catch (error) {
		return handleDeveloperAdminError(error, res, "updateDeveloperFeatureFlag");
	}
};
