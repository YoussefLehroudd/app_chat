import {
	parseCallMessageContent,
	parseGroupInviteMessageContent,
	parseStoryInteractionMessageContent,
	parseSystemMessageContent,
} from "./systemMessages.js";
import { normalizeDeveloperPermissions } from "./developerPermissions.js";

const toUserDto = (user, options = {}) => {
	if (!user) return null;
	const canRevealLastSeen = user.showLastSeen !== false;
	const userDto = {
		_id: user.id,
		fullName: user.fullName,
		username: user.username,
		role: user.role ?? "USER",
		isPrimaryDeveloper: user.isPrimaryDeveloper ?? false,
		isArchived: user.isArchived ?? false,
		archivedAt: user.archivedAt ?? null,
		isBanned: user.isBanned ?? false,
		bannedAt: user.bannedAt ?? null,
		bannedReason: user.bannedReason ?? null,
		isVerified: user.isVerified ?? false,
		verifiedAt: user.verifiedAt ?? null,
		profilePic: user.profilePic,
		gender: user.gender,
		bio: user.bio ?? "",
		lastSeen: canRevealLastSeen ? user.lastSeen ?? null : null,
		lastMessage: user.lastMessage ?? null,
		lastMessageAt: user.lastMessageAt ?? null,
		unreadCount: user.unreadCount ?? 0,
		hasUnread: (user.unreadCount ?? 0) > 0,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		showOnlineStatus: user.showOnlineStatus ?? true,
		showLastSeen: canRevealLastSeen,
		showReadReceipts: user.showReadReceipts ?? true,
		showTypingStatus: user.showTypingStatus ?? true,
		isEmailVerified: Boolean(user.emailVerifiedAt),
		emailVerifiedAt: user.emailVerifiedAt ?? null,
		twoFactorEnabled: Boolean(user.twoFactorEnabled),
	};

	if (options.includeDeveloperPermissions) {
		userDto.developerPermissions = normalizeDeveloperPermissions(user.developerPermissions);
	}

	if (options.includeSensitiveFields) {
		userDto.email = user.email ?? "";
		userDto.hasRecoveryEmail = Boolean(user.email);
		userDto.currentSessionId = user.currentSessionId ?? null;
		userDto.failedLoginAttempts = user.failedLoginAttempts ?? 0;
		userDto.lockedUntil = user.lockedUntil ?? null;
	}

	return userDto;
};

const buildReactionSummary = (reactions = [], viewerId = null) => {
	if (!Array.isArray(reactions) || reactions.length === 0) return [];

	const reactionMap = new Map();
	for (const reaction of reactions) {
		if (!reaction?.emoji) continue;
		if (!reactionMap.has(reaction.emoji)) {
			reactionMap.set(reaction.emoji, {
				emoji: reaction.emoji,
				count: 0,
				reactedByMe: false,
				userIds: [],
			});
		}

		const entry = reactionMap.get(reaction.emoji);
		entry.count += 1;
		if (reaction.userId) {
			entry.userIds.push(reaction.userId);
			if (viewerId && reaction.userId === viewerId) {
				entry.reactedByMe = true;
			}
		}
	}

	return Array.from(reactionMap.values()).sort((reactionA, reactionB) => reactionB.count - reactionA.count);
};

const buildMessageAttachmentDto = (message) => {
	if (!message?.attachmentUrl) return null;

	return {
		url: message.attachmentUrl,
		type: message.attachmentType || "FILE",
		mimeType: message.attachmentMimeType || null,
		fileName: message.attachmentFileName || null,
		fileSize: message.attachmentFileSize ?? null,
		resourceType: message.attachmentResourceType || null,
	};
};

const getAttachmentPreviewText = (attachment) => {
	if (!attachment) return null;

	if (attachment.type === "IMAGE") {
		return attachment.fileName || "Photo";
	}

	if (attachment.type === "VIDEO") {
		return attachment.fileName || "Video";
	}

	if (attachment.type === "PDF") {
		return attachment.fileName || "PDF";
	}

	return attachment.fileName || "File";
};

const getMessagePresentation = (value, attachment = null) => {
	const parsedSystemMessage = parseSystemMessageContent(value);

	if (parsedSystemMessage) {
		return {
			message: parsedSystemMessage.text,
			previewText: parsedSystemMessage.text,
			isSystem: true,
			systemText: parsedSystemMessage.text,
			systemType: parsedSystemMessage.type,
			isCallMessage: false,
			callInfo: null,
			isGroupInvite: false,
			groupInvite: null,
			isStoryInteraction: false,
			storyInteraction: null,
		};
	}

	const parsedCallMessage = parseCallMessageContent(value);
	if (parsedCallMessage) {
		return {
			message: parsedCallMessage.previewText,
			previewText: parsedCallMessage.previewText,
			isSystem: false,
			systemText: null,
			systemType: null,
			isCallMessage: true,
			callInfo: parsedCallMessage,
			isGroupInvite: false,
			groupInvite: null,
			isStoryInteraction: false,
			storyInteraction: null,
		};
	}

	const parsedGroupInvite = parseGroupInviteMessageContent(value);
	if (parsedGroupInvite) {
		return {
			message: `${parsedGroupInvite.inviterName} invited you to ${parsedGroupInvite.groupTitle}`,
			previewText: "Group invitation",
			isSystem: false,
			systemText: null,
			systemType: null,
			isCallMessage: false,
			callInfo: null,
			isGroupInvite: true,
			groupInvite: parsedGroupInvite,
			isStoryInteraction: false,
			storyInteraction: null,
		};
	}

	const parsedStoryInteraction = parseStoryInteractionMessageContent(value);
	if (parsedStoryInteraction) {
		const isReaction = parsedStoryInteraction.interactionType === "REACTION";
		const previewText =
			parsedStoryInteraction.previewText ||
			(isReaction ? "Reacted to your story" : "Replied to your story");
		const displayMessage = isReaction
			? `${parsedStoryInteraction.emoji || "❤️"} Reacted to your story`
			: `💬 Replied to your story${parsedStoryInteraction.comment ? `: ${parsedStoryInteraction.comment}` : ""}`;

		return {
			message: displayMessage,
			previewText,
			isSystem: false,
			systemText: null,
			systemType: null,
			isCallMessage: false,
			callInfo: null,
			isGroupInvite: false,
			groupInvite: null,
			isStoryInteraction: true,
			storyInteraction: parsedStoryInteraction,
		};
	}

	return {
		message: value,
		previewText:
			typeof value === "string" ? value.trim() || getAttachmentPreviewText(attachment) || "Message" : getAttachmentPreviewText(attachment) || "Message",
		isSystem: false,
		systemText: null,
		systemType: null,
		isCallMessage: false,
		callInfo: null,
		isGroupInvite: false,
		groupInvite: null,
		isStoryInteraction: false,
		storyInteraction: null,
	};
};

const toConversationMemberDto = (member) => {
	if (!member?.user) return null;

	const user = toUserDto(member.user);
	return {
		...user,
		memberRole: member.role ?? "MEMBER",
		joinedAt: member.joinedAt ?? null,
		lastReadAt: member.lastReadAt ?? null,
	};
};

const toConversationItemDto = (conversation, viewerId) => {
	if (!conversation) return null;

	if (conversation.type === "GROUP") {
		const members = (conversation.members || []).map(toConversationMemberDto).filter(Boolean);
		return {
			_id: conversation.id,
			conversationId: conversation.id,
			type: "GROUP",
			isGroup: true,
			fullName: conversation.title || "Untitled group",
			username: conversation.isPrivate ? "private-group" : "group-chat",
			role: "USER",
			isPrimaryDeveloper: false,
			isArchived: false,
			archivedAt: null,
			isBanned: false,
			bannedAt: null,
			bannedReason: null,
			isVerified: false,
			verifiedAt: null,
			profilePic: conversation.profilePic || "",
			gender: null,
			bio: conversation.description ?? "",
			lastSeen: null,
			lastMessage: conversation.lastMessage ?? null,
			lastMessageAt: conversation.lastMessageAt ?? null,
			unreadCount: conversation.unreadCount ?? 0,
			hasUnread: (conversation.unreadCount ?? 0) > 0,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
			isPrivate: conversation.isPrivate ?? false,
			memberLimit: conversation.memberLimit ?? null,
			memberCount: members.length,
			createdById: conversation.createdById ?? null,
			groupRole: conversation.groupRole ?? null,
			isMember: Boolean(conversation.isMember ?? conversation.groupRole),
			members,
			isArchived: Boolean(conversation.isArchived),
			archivedAt: conversation.archivedAt ?? null,
			mutedUntil: conversation.mutedUntil ?? null,
			disappearingMessagesSeconds: conversation.disappearingMessagesSeconds ?? null,
		};
	}

	const otherUser = conversation.userOneId === viewerId ? conversation.userTwo : conversation.userOne;
	const userDto = toUserDto({
		...otherUser,
		lastMessage: conversation.lastMessage ?? null,
		lastMessageAt: conversation.lastMessageAt ?? null,
		unreadCount: conversation.unreadCount ?? 0,
	});

	return {
		...userDto,
		conversationId: conversation.id,
		type: "DIRECT",
		isGroup: false,
		isPrivate: false,
		memberLimit: null,
		memberCount: 2,
		members: [],
		createdById: null,
		groupRole: null,
		isMember: true,
		isArchived: Boolean(conversation.isArchived),
		archivedAt: conversation.archivedAt ?? null,
		mutedUntil: conversation.mutedUntil ?? null,
		disappearingMessagesSeconds: conversation.disappearingMessagesSeconds ?? null,
	};
};

const toMessagePreviewDto = (message, options = {}) => {
	if (!message) return null;
	const viewerId = options.viewerId || null;
	const attachment = buildMessageAttachmentDto(message);
	const presentation = getMessagePresentation(message.message, attachment);
	return {
		_id: message.id,
		conversationId: message.conversationId,
		conversationType: message.conversation?.type ?? "DIRECT",
		senderId: message.senderId,
		receiverId: message.receiverId ?? null,
		message: presentation.message,
		audio: message.audio,
		audioDurationSeconds: message.audioDurationSeconds ?? null,
		attachment,
		isSeen: message.isSeen,
		deliveredAt: message.deliveredAt ?? null,
		editedAt: message.editedAt ?? null,
		expiresAt: message.expiresAt ?? null,
		deletedFor: message.deletedFor ?? [],
		sender: message.sender ? toUserDto(message.sender) : null,
		reactions: buildReactionSummary(message.reactions, viewerId),
		isPinned: Boolean(message.pinnedEntries?.length),
		isSaved: Boolean(
			Array.isArray(message.savedEntries)
				? message.savedEntries.some((entry) => entry?.userId === viewerId)
				: false
		),
		isSystem: presentation.isSystem,
		systemText: presentation.systemText,
		systemType: presentation.systemType,
		isCallMessage: presentation.isCallMessage,
		callInfo: presentation.callInfo,
		isGroupInvite: presentation.isGroupInvite,
		groupInvite: presentation.groupInvite,
		isStoryInteraction: presentation.isStoryInteraction,
		storyInteraction: presentation.storyInteraction,
		previewText: presentation.previewText,
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
	};
};

const toMessageDto = (message, options = {}) => {
	if (!message) return null;
	const viewerId = options.viewerId || null;
	const attachment = buildMessageAttachmentDto(message);
	const presentation = getMessagePresentation(message.message, attachment);
	return {
		_id: message.id,
		conversationId: message.conversationId,
		conversationType: message.conversation?.type ?? "DIRECT",
		senderId: message.senderId,
		receiverId: message.receiverId ?? null,
		message: presentation.message,
		audio: message.audio,
		audioDurationSeconds: message.audioDurationSeconds ?? null,
		attachment,
		repliedMessageId: message.repliedMessage ? toMessagePreviewDto(message.repliedMessage, options) : null,
		isSeen: message.isSeen,
		deliveredAt: message.deliveredAt ?? null,
		editedAt: message.editedAt ?? null,
		expiresAt: message.expiresAt ?? null,
		deletedFor: message.deletedFor ?? [],
		sender: message.sender ? toUserDto(message.sender) : null,
		reactions: buildReactionSummary(message.reactions, viewerId),
		isPinned: Boolean(message.pinnedEntries?.length),
		isSaved: Boolean(
			Array.isArray(message.savedEntries)
				? message.savedEntries.some((entry) => entry?.userId === viewerId)
				: false
		),
		isSystem: presentation.isSystem,
		systemText: presentation.systemText,
		systemType: presentation.systemType,
		isCallMessage: presentation.isCallMessage,
		callInfo: presentation.callInfo,
		isGroupInvite: presentation.isGroupInvite,
		groupInvite: presentation.groupInvite,
		isStoryInteraction: presentation.isStoryInteraction,
		storyInteraction: presentation.storyInteraction,
		previewText: presentation.previewText,
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
	};
};

export { toConversationItemDto, toConversationMemberDto, toMessageDto, toMessagePreviewDto, toUserDto };
