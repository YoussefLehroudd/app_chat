import { getUserSocketIds, io } from "../socket/socket.js";
import { toUserDto } from "./formatters.js";

const PUBLIC_USER_UPDATE_FIELDS = [
	"_id",
	"fullName",
	"username",
	"role",
	"isPrimaryDeveloper",
	"isVerified",
	"verifiedAt",
	"profilePic",
	"gender",
	"bio",
	"lastSeen",
	"updatedAt",
];

const emitToUsers = (userIds, eventName, payload) => {
	[...new Set((userIds || []).filter(Boolean))].forEach((userId) => {
		getUserSocketIds(userId).forEach((socketId) => {
			io.to(socketId).emit(eventName, payload);
		});
	});
};

const emitSessionUserUpdated = (user) => {
	if (!user?.id) return;
	emitToUsers([user.id], "sessionUserUpdated", toUserDto(user, { includeDeveloperPermissions: true }));
};

const emitPublicUserUpdated = (user) => {
	if (!user?.id) return;
	const publicUser = toUserDto(user);
	const payload = PUBLIC_USER_UPDATE_FIELDS.reduce((result, key) => {
		if (publicUser[key] !== undefined) {
			result[key] = publicUser[key];
		}
		return result;
	}, {});

	io.emit("publicUserUpdated", payload);
};

const emitDeveloperWorkspaceRefresh = (payload = {}) => {
	io.emit("developerWorkspaceRefresh", {
		...payload,
		emittedAt: new Date().toISOString(),
	});
};

const emitConversationsRefreshRequired = (userIds, payload = {}) => {
	emitToUsers(userIds, "conversationsRefreshRequired", payload);
};

export {
	emitConversationsRefreshRequired,
	emitDeveloperWorkspaceRefresh,
	emitPublicUserUpdated,
	emitSessionUserUpdated,
	emitToUsers,
};
