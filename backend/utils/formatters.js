const toUserDto = (user) => {
	if (!user) return null;
	return {
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
		lastSeen: user.lastSeen ?? null,
		lastMessage: user.lastMessage ?? null,
		lastMessageAt: user.lastMessageAt ?? null,
		unreadCount: user.unreadCount ?? 0,
		hasUnread: (user.unreadCount ?? 0) > 0,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
};

const toMessagePreviewDto = (message) => {
	if (!message) return null;
	return {
		_id: message.id,
		senderId: message.senderId,
		receiverId: message.receiverId,
		message: message.message,
		audio: message.audio,
		audioDurationSeconds: message.audioDurationSeconds ?? null,
		isSeen: message.isSeen,
		deletedFor: message.deletedFor ?? [],
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
	};
};

const toMessageDto = (message) => {
	if (!message) return null;
	return {
		_id: message.id,
		senderId: message.senderId,
		receiverId: message.receiverId,
		message: message.message,
		audio: message.audio,
		audioDurationSeconds: message.audioDurationSeconds ?? null,
		repliedMessageId: message.repliedMessage ? toMessagePreviewDto(message.repliedMessage) : null,
		isSeen: message.isSeen,
		deletedFor: message.deletedFor ?? [],
		createdAt: message.createdAt,
		updatedAt: message.updatedAt,
	};
};

export { toUserDto, toMessageDto, toMessagePreviewDto };
