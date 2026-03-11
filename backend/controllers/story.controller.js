import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { toMessageDto, toUserDto } from "../utils/formatters.js";
import { emitToUsers } from "../utils/realtime.js";
import { findOrCreateDirectConversation } from "../utils/conversations.js";
import { buildStoryInteractionMessage } from "../utils/systemMessages.js";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STORY_TEXT_LENGTH = 700;
const MAX_STORY_COMMENT_LENGTH = 700;
const STORY_INTERACTION_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_STORY_REACTION = "❤️";
const ALLOWED_STORY_REACTIONS = new Set(["❤️", "😍", "🔥", "😂", "😮", "😢", "👏", "👍", "💯", "🥳"]);

const activeUserWhere = {
	isArchived: false,
	isBanned: false,
};

const storyUserSelect = {
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

const storyMessageInclude = {
	sender: true,
	conversation: {
		select: {
			type: true,
		},
	},
	repliedMessage: {
		include: {
			sender: true,
			conversation: {
				select: {
					type: true,
				},
			},
		},
	},
};

const normalizeStoryText = (value) => (typeof value === "string" ? value.trim() : "");
const normalizeReactionValue = (value) => (typeof value === "string" ? value.trim() : "");
const normalizeCommentValue = (value) => (typeof value === "string" ? value.trim() : "");

const resolveStoryMedia = (file) => {
	if (!file) {
		return {
			mediaType: "TEXT",
			mediaUrl: null,
			mediaMimeType: null,
		};
	}

	const mimeType = file.mimetype || "";
	if (mimeType.startsWith("image/")) {
		return {
			mediaType: "IMAGE",
			mediaUrl: file.path,
			mediaMimeType: mimeType,
		};
	}

	if (mimeType.startsWith("video/")) {
		return {
			mediaType: "VIDEO",
			mediaUrl: file.path,
			mediaMimeType: mimeType,
		};
	}

	return null;
};

const toStoryDto = (story, viewerId) => {
	const viewerRecord = story?.views?.[0] ?? null;
	const isOwnStory = story?.userId === viewerId;

	return {
		_id: story.id,
		userId: story.userId,
		text: story.text || "",
		mediaUrl: story.mediaUrl || null,
		mediaType: story.mediaType || "TEXT",
		mediaMimeType: story.mediaMimeType || null,
		author: toUserDto(story.user),
		isOwn: isOwnStory,
		isSeen: isOwnStory || Boolean(viewerRecord),
		seenAt: viewerRecord?.seenAt || null,
		viewCount: story?._count?.views ?? 0,
		createdAt: story.createdAt,
		updatedAt: story.updatedAt,
		expiresAt: story.expiresAt,
	};
};

const groupStoriesByAuthor = (stories, viewerId) => {
	const groupedStories = new Map();

	stories.forEach((story) => {
		const storyDto = toStoryDto(story, viewerId);
		const authorId = storyDto.author?._id || storyDto.userId;
		if (!authorId) return;

		if (!groupedStories.has(authorId)) {
			groupedStories.set(authorId, {
				user: storyDto.author,
				stories: [],
			});
		}

		groupedStories.get(authorId).stories.push(storyDto);
	});

	const groups = Array.from(groupedStories.values()).map((group) => {
		const sortedStories = [...group.stories].sort((storyA, storyB) => {
			const storyATime = new Date(storyA.createdAt).getTime();
			const storyBTime = new Date(storyB.createdAt).getTime();
			if (storyATime !== storyBTime) return storyATime - storyBTime;
			return storyA._id.localeCompare(storyB._id);
		});

		const unseenStories = sortedStories.filter((story) => !story.isSeen && !story.isOwn);
		const latestCreatedAt =
			sortedStories.length > 0 ? sortedStories[sortedStories.length - 1].createdAt : null;

		return {
			user: group.user,
			stories: sortedStories,
			hasUnseen: unseenStories.length > 0,
			unseenCount: unseenStories.length,
			latestCreatedAt,
		};
	});

	const ownStoryGroup = groups.find((group) => group.user?._id === viewerId) || null;
	const otherGroups = groups
		.filter((group) => group.user?._id !== viewerId)
		.sort((groupA, groupB) => {
			if (groupA.hasUnseen !== groupB.hasUnseen) {
				return groupA.hasUnseen ? -1 : 1;
			}

			const groupATime = groupA.latestCreatedAt ? new Date(groupA.latestCreatedAt).getTime() : 0;
			const groupBTime = groupB.latestCreatedAt ? new Date(groupB.latestCreatedAt).getTime() : 0;
			return groupBTime - groupATime;
		});

	return ownStoryGroup ? [ownStoryGroup, ...otherGroups] : otherGroups;
};

const getActiveUserIds = async () => {
	const users = await prisma.user.findMany({
		where: activeUserWhere,
		select: {
			id: true,
		},
	});

	return users.map((user) => user.id);
};

const getActiveStoryById = async (storyId) =>
	prisma.story.findFirst({
		where: {
			id: storyId,
			expiresAt: {
				gt: new Date(),
			},
			user: activeUserWhere,
		},
		include: {
			user: {
				select: storyUserSelect,
			},
		},
	});

const getInteractableStoryById = async (storyId) =>
	prisma.story.findFirst({
		where: {
			id: storyId,
			user: activeUserWhere,
		},
		include: {
			user: {
				select: storyUserSelect,
			},
		},
	});

const isStoryWithinInteractionWindow = (story) => {
	if (!story?.expiresAt) return false;
	const expiresAtTime = new Date(story.expiresAt).getTime();
	if (!Number.isFinite(expiresAtTime)) return false;
	return Date.now() <= expiresAtTime + STORY_INTERACTION_GRACE_MS;
};

const buildStoryReactionMessageText = ({ story, emoji }) => {
	return buildStoryInteractionMessage({
		storyId: story?.id,
		storyOwnerId: story?.userId,
		storyOwnerName: story?.user?.fullName || story?.user?.username || "Story owner",
		storyMediaType: story?.mediaType || "TEXT",
		storyMediaUrl: story?.mediaUrl || "",
		storyText: story?.text || "",
		interactionType: "REACTION",
		emoji,
		previewText: "Reacted to your story",
	});
};

const buildStoryCommentMessageText = ({ story, comment }) => {
	return buildStoryInteractionMessage({
		storyId: story?.id,
		storyOwnerId: story?.userId,
		storyOwnerName: story?.user?.fullName || story?.user?.username || "Story owner",
		storyMediaType: story?.mediaType || "TEXT",
		storyMediaUrl: story?.mediaUrl || "",
		storyText: story?.text || "",
		interactionType: "COMMENT",
		comment,
		previewText: "Replied to your story",
	});
};

const dispatchStoryInteractionMessage = async ({ actorId, ownerId, messageText }) => {
	const conversation = await findOrCreateDirectConversation(actorId, ownerId);
	const createdMessage = await prisma.message.create({
		data: {
			conversationId: conversation.id,
			senderId: actorId,
			receiverId: ownerId,
			message: messageText,
		},
		include: storyMessageInclude,
	});

	const formattedMessage = toMessageDto(createdMessage);
	emitToUsers([actorId, ownerId], "newMessage", formattedMessage);
	emitToUsers([actorId, ownerId], "conversationsRefreshRequired", {
		conversationId: conversation.id,
	});
	return formattedMessage;
};

export const getStoriesFeed = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const now = new Date();
		const stories = await prisma.story.findMany({
			where: {
				expiresAt: {
					gt: now,
				},
				user: activeUserWhere,
			},
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			include: {
				user: {
					select: storyUserSelect,
				},
				views: {
					where: {
						viewerId,
					},
					select: {
						viewerId: true,
						seenAt: true,
					},
					take: 1,
				},
				_count: {
					select: {
						views: true,
					},
				},
			},
		});

		const groups = groupStoriesByAuthor(stories, viewerId);
		return res.status(200).json(groups);
	} catch (error) {
		console.error("Error in getStoriesFeed:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const createStory = async (req, res) => {
	try {
		const userId = req.user._id;
		const normalizedText = normalizeStoryText(req.body?.text);
		const resolvedMedia = resolveStoryMedia(req.file);

		if (normalizedText.length > MAX_STORY_TEXT_LENGTH) {
			return res.status(400).json({ error: `Story text is too long (max ${MAX_STORY_TEXT_LENGTH} characters)` });
		}

		if (!resolvedMedia) {
			return res.status(400).json({ error: "Only image or video files are supported for stories" });
		}

		if (!normalizedText && !resolvedMedia.mediaUrl) {
			return res.status(400).json({ error: "Add text, image, or video to publish a story" });
		}

		const expiresAt = new Date(Date.now() + STORY_TTL_MS);
		const createdStory = await prisma.story.create({
			data: {
				userId,
				text: normalizedText || "",
				mediaUrl: resolvedMedia.mediaUrl,
				mediaType: resolvedMedia.mediaType,
				mediaMimeType: resolvedMedia.mediaMimeType,
				expiresAt,
			},
			include: {
				user: {
					select: storyUserSelect,
				},
				views: {
					where: {
						viewerId: userId,
					},
					select: {
						viewerId: true,
						seenAt: true,
					},
					take: 1,
				},
				_count: {
					select: {
						views: true,
					},
				},
			},
		});

		const storyDto = toStoryDto(createdStory, userId);
		const audienceIds = await getActiveUserIds();
		emitToUsers(audienceIds, "story:created", { story: storyDto });

		return res.status(201).json(storyDto);
	} catch (error) {
		console.error("Error in createStory:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const markStoryAsSeen = async (req, res) => {
	try {
		const viewerId = req.user._id;
		const { id: storyId } = req.params;

		const story = await prisma.story.findFirst({
			where: {
				id: storyId,
				expiresAt: {
					gt: new Date(),
				},
				user: activeUserWhere,
			},
			select: {
				id: true,
				userId: true,
			},
		});

		if (!story) {
			return res.status(404).json({ error: "Story not found" });
		}

		if (story.userId === viewerId) {
			const ownViewCount = await prisma.storyView.count({
				where: {
					storyId: story.id,
				},
			});

			return res.status(200).json({
				storyId: story.id,
				seenAt: null,
				viewCount: ownViewCount,
			});
		}

		const seenAt = new Date();
		const seenRecord = await prisma.storyView.upsert({
			where: {
				storyId_viewerId: {
					storyId: story.id,
					viewerId,
				},
			},
			update: {
				seenAt,
			},
			create: {
				storyId: story.id,
				viewerId,
				seenAt,
			},
		});

		const viewCount = await prisma.storyView.count({
			where: {
				storyId: story.id,
			},
		});

		emitToUsers([story.userId], "story:viewed", {
			storyId: story.id,
			viewerId,
			seenAt: seenRecord.seenAt,
			viewCount,
		});

		return res.status(200).json({
			storyId: story.id,
			seenAt: seenRecord.seenAt,
			viewCount,
		});
	} catch (error) {
		console.error("Error in markStoryAsSeen:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const deleteStory = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: storyId } = req.params;

		const story = await prisma.story.findUnique({
			where: {
				id: storyId,
			},
			select: {
				id: true,
				userId: true,
			},
		});

		if (!story) {
			return res.status(404).json({ error: "Story not found" });
		}

		if (story.userId !== userId) {
			return res.status(403).json({ error: "Unauthorized to delete this story" });
		}

		await prisma.story.delete({
			where: {
				id: storyId,
			},
		});

		const audienceIds = await getActiveUserIds();
		emitToUsers(audienceIds, "story:deleted", {
			storyId,
			userId,
		});

		return res.status(200).json({ message: "Story deleted" });
	} catch (error) {
		console.error("Error in deleteStory:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const getStoryViewers = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: storyId } = req.params;

		const story = await prisma.story.findUnique({
			where: {
				id: storyId,
			},
			select: {
				id: true,
				userId: true,
			},
		});

		if (!story) {
			return res.status(404).json({ error: "Story not found" });
		}

		if (story.userId !== userId) {
			return res.status(403).json({ error: "Unauthorized to access story viewers" });
		}

		const views = await prisma.storyView.findMany({
			where: {
				storyId,
			},
			orderBy: [{ seenAt: "desc" }],
			include: {
				viewer: {
					select: storyUserSelect,
				},
			},
		});

		return res.status(200).json(
			views.map((view) => ({
				viewer: toUserDto(view.viewer),
				seenAt: view.seenAt,
			}))
		);
	} catch (error) {
		console.error("Error in getStoryViewers:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const reactToStory = async (req, res) => {
	try {
		const actorId = req.user._id;
		const storyId = req.params.id;
		const reactionInput = normalizeReactionValue(req.body?.emoji);
		const emoji = ALLOWED_STORY_REACTIONS.has(reactionInput) ? reactionInput : DEFAULT_STORY_REACTION;

		const story = await getInteractableStoryById(storyId);
		if (!story) {
			return res.status(404).json({ error: "Story not found" });
		}
		if (!isStoryWithinInteractionWindow(story)) {
			return res.status(410).json({ error: "Story expired" });
		}

		if (story.userId === actorId) {
			return res.status(400).json({ error: "You cannot react to your own story" });
		}

		const actor = req.user;

		const messageText = buildStoryReactionMessageText({ story, emoji });
		const message = await dispatchStoryInteractionMessage({
			actorId,
			ownerId: story.userId,
			messageText,
		});

		emitToUsers([story.userId], "story:interaction", {
			type: "REACTION",
			storyId: story.id,
			emoji,
			fromUser: actor,
			createdAt: message.createdAt,
		});

		return res.status(201).json({
			message: "Reaction sent",
			emoji,
		});
	} catch (error) {
		console.error("Error in reactToStory:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};

export const commentOnStory = async (req, res) => {
	try {
		const actorId = req.user._id;
		const storyId = req.params.id;
		const comment = normalizeCommentValue(req.body?.message);

		if (!comment) {
			return res.status(400).json({ error: "Comment is required" });
		}

		if (comment.length > MAX_STORY_COMMENT_LENGTH) {
			return res
				.status(400)
				.json({ error: `Comment is too long (max ${MAX_STORY_COMMENT_LENGTH} characters)` });
		}

		const story = await getInteractableStoryById(storyId);
		if (!story) {
			return res.status(404).json({ error: "Story not found" });
		}
		if (!isStoryWithinInteractionWindow(story)) {
			return res.status(410).json({ error: "Story expired" });
		}

		if (story.userId === actorId) {
			return res.status(400).json({ error: "You cannot comment on your own story" });
		}

		const actor = req.user;

		const messageText = buildStoryCommentMessageText({ story, comment });
		const message = await dispatchStoryInteractionMessage({
			actorId,
			ownerId: story.userId,
			messageText,
		});

		emitToUsers([story.userId], "story:interaction", {
			type: "COMMENT",
			storyId: story.id,
			comment,
			fromUser: actor,
			createdAt: message.createdAt,
		});

		return res.status(201).json({
			message: "Comment sent",
		});
	} catch (error) {
		console.error("Error in commentOnStory:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		return res.status(500).json({ error: "Internal server error" });
	}
};
