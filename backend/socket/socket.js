import { Server } from "socket.io";
import http from "http";
import express from "express";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseAvailable, isPrismaConnectionError, prisma } from "../db/prisma.js";
import {
	endCallSessionRecord,
	formatCallSessionForUser,
	getActiveCallUserIds,
	getActiveJoinedCallSessionsForUser,
	getInvitedCallUserIds,
	leaveCallSessionRecord,
} from "../utils/calls.js";

const app = express();

const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const io = new Server(server, {
	cors: {
		origin: allowedOrigins,
		methods: ["GET", "POST"],
	},
});

export const getReceiverSocketId = (receiverId) => {
	const sockets = userSocketMap.get(receiverId);
	if (!sockets || sockets.size === 0) return null;
	return sockets.values().next().value;
};

export const getUserSocketIds = (userId) => {
	const sockets = userSocketMap.get(userId);
	return sockets ? Array.from(sockets) : [];
};

const userSocketMap = new Map(); // Map<userId, Set<socketId>>
const userPresenceSettingsMap = new Map(); // Map<userId, { showOnlineStatus, showLastSeen, showTypingStatus }>

const emitOnlineUsers = () => {
	io.emit(
		"getOnlineUsers",
		Array.from(userSocketMap.keys()).filter(
			(userId) => userPresenceSettingsMap.get(userId)?.showOnlineStatus !== false
		)
	);
};

const emitToUserSockets = (targetUserId, eventName, payload) => {
	if (!targetUserId) return;

	const sockets = getUserSocketIds(targetUserId);
	sockets.forEach((socketId) => {
		io.to(socketId).emit(eventName, payload);
	});
};

const emitToUsers = (userIds, eventName, payload) => {
	[...new Set((userIds || []).filter(Boolean))].forEach((targetUserId) => {
		emitToUserSockets(targetUserId, eventName, payload);
	});
};

const emitCallPayloadToUsers = (userIds, eventName, callSession) => {
	[...new Set((userIds || []).filter(Boolean))].forEach((targetUserId) => {
		const call = formatCallSessionForUser(callSession, targetUserId);
		if (!call) return;
		emitToUserSockets(targetUserId, eventName, { call });
	});
};

const emitCallMessageRefresh = (result) => {
	if (!result?.formattedMessage) return;

	emitToUsers(result.audienceUserIds, "messageUpdated", result.formattedMessage);
	emitToUsers(result.audienceUserIds, "conversationsRefreshRequired", {
		conversationId: result.formattedMessage.conversationId,
	});
};

const groupCallSessions = new Map();

const callUserSelect = {
	id: true,
	fullName: true,
	username: true,
	role: true,
	isPrimaryDeveloper: true,
	isVerified: true,
	profilePic: true,
	gender: true,
};

const toCallUser = (user) => {
	if (!user?.id) return null;

	return {
		_id: user.id,
		fullName: user.fullName,
		username: user.username,
		role: user.role || "USER",
		isPrimaryDeveloper: Boolean(user.isPrimaryDeveloper),
		isVerified: Boolean(user.isVerified),
		profilePic: user.profilePic || "",
		gender: user.gender || null,
	};
};

const getGroupConversationForCall = async (conversationId, userId) =>
	prisma.conversation.findFirst({
		where: {
			id: conversationId,
			type: "GROUP",
			members: {
				some: { userId },
			},
		},
		select: {
			id: true,
			title: true,
			profilePic: true,
			isPrivate: true,
			members: {
				select: {
					userId: true,
					user: {
						select: callUserSelect,
					},
				},
			},
		},
	});

const buildGroupConversationSummary = (conversation) => ({
	_id: conversation.id,
	fullName: conversation.title || "Untitled group",
	profilePic: conversation.profilePic || "",
	isPrivate: Boolean(conversation.isPrivate),
	memberCount: conversation.members.length,
});

const getGroupCallParticipantIds = (session) => [...session.participantIds];
const getGroupCallInvitedIds = (session) => [...session.invitedUserIds];

const removeUserFromGroupCalls = (userId) => {
	if (!userId) return;

	for (const [callId, session] of groupCallSessions.entries()) {
		const isParticipant = session.participantIds.has(userId);
		const wasInvited = session.invitedUserIds.delete(userId);

		if (!isParticipant && !wasInvited) continue;

		if (session.initiatorId === userId) {
			const targets = [...new Set([...session.participantIds, ...session.invitedUserIds])].filter(
				(targetUserId) => targetUserId !== userId
			);
			emitToUsers(targets, "group-call:ended", {
				callId,
				conversationId: session.conversationId,
				endedByUserId: userId,
			});
			groupCallSessions.delete(callId);
			continue;
		}

		if (isParticipant) {
			session.participantIds.delete(userId);
			const targets = [...new Set([...session.participantIds, ...session.invitedUserIds])];
			emitToUsers(targets, "group-call:participant-left", {
				callId,
				participantUserId: userId,
			});
		}

		if (session.participantIds.size === 0) {
			groupCallSessions.delete(callId);
		}
	}
};

const cleanupDisconnectedUserCalls = async (userId) => {
	if (!userId) return;

	const activeCallSessions = await getActiveJoinedCallSessionsForUser(userId);
	for (const callSession of activeCallSessions) {
		const result =
			callSession.createdById === userId
				? await endCallSessionRecord({ callId: callSession.id, endedById: userId })
				: await leaveCallSessionRecord({ callId: callSession.id, userId });

		if (!result?.callSession) {
			continue;
		}

		emitCallMessageRefresh(result);

		const activeUserIds = getActiveCallUserIds(result.callSession);
		const invitedUserIds = getInvitedCallUserIds(result.callSession);
		const liveAudienceIds = [...new Set([...activeUserIds, ...invitedUserIds])];
		emitCallPayloadToUsers(liveAudienceIds, "call:participants", result.callSession);

		if (result.callSession.status === "ENDED") {
			emitToUsers(
				result.callSession.participants
					.map((participant) => participant.userId)
					.filter((participantUserId) => participantUserId !== userId),
				"call:ended",
				{
					callId: result.callSession.id,
					endedByUserId: userId,
				}
			);
			continue;
		}

		emitToUsers(
			liveAudienceIds.filter((participantUserId) => participantUserId !== userId),
			"call:participant-left",
			{
				callId: result.callSession.id,
				participantUserId: userId,
			}
		);
	}
};

export const disconnectUserSockets = (userId, reason = "account-removed") => {
	const sockets = userSocketMap.get(userId);
	if (!sockets || sockets.size === 0) return 0;

	userSocketMap.delete(userId);

	sockets.forEach((socketId) => {
		const activeSocket = io.sockets.sockets.get(socketId);
		if (activeSocket) {
			activeSocket.emit("accountRemoved", { reason });
			activeSocket.disconnect(true);
		}
	});

	emitOnlineUsers();
	return sockets.size;
};

io.on("connection", async (socket) => {
	const userId = typeof socket.handshake.query.userId === "string" ? socket.handshake.query.userId : null;

	if (userId && userId !== "undefined") {
		if (!isDatabaseAvailable()) {
			socket.emit("serviceUnavailable", { error: DATABASE_UNAVAILABLE_MESSAGE });
			socket.disconnect(true);
			return;
		}

		try {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: {
					id: true,
					isArchived: true,
					isBanned: true,
					showOnlineStatus: true,
					showLastSeen: true,
					showTypingStatus: true,
				},
			});

			if (!user) {
				socket.disconnect(true);
				return;
			}

			if (user.isArchived) {
				socket.emit("accountRemoved", { reason: "archived" });
				socket.disconnect(true);
				return;
			}

			if (user.isBanned) {
				socket.emit("accountRemoved", { reason: "banned" });
				socket.disconnect(true);
				return;
			}

			const existing = userSocketMap.get(userId) || new Set();
			existing.add(socket.id);
			userSocketMap.set(userId, existing);
			userPresenceSettingsMap.set(userId, {
				showOnlineStatus: user.showOnlineStatus !== false,
				showLastSeen: user.showLastSeen !== false,
				showTypingStatus: user.showTypingStatus !== false,
			});
		} catch (error) {
			if (isPrismaConnectionError(error)) {
				console.warn("Socket user verification failed because the database is temporarily unavailable.");
				socket.emit("serviceUnavailable", { error: DATABASE_UNAVAILABLE_MESSAGE });
				socket.disconnect(true);
				return;
			} else {
				console.error("Error verifying socket user:", error.message);
				socket.disconnect(true);
				return;
			}
		}
	}

	console.log("a user connected", socket.id);

	// io.emit() is used to send events to all the connected clients
	emitOnlineUsers();

	// Listen for typing events
	socket.on("typing", (receiverId) => {
		if (userPresenceSettingsMap.get(userId)?.showTypingStatus === false) {
			return;
		}
		const receiverSocketId = getReceiverSocketId(receiverId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("userTyping", userId);
		}
	});

	// Listen for stop typing events
	socket.on("stopTyping", (receiverId) => {
		if (userPresenceSettingsMap.get(userId)?.showTypingStatus === false) {
			return;
		}
		const receiverSocketId = getReceiverSocketId(receiverId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("userStopTyping", userId);
		}
	});

	socket.on("recording:start", (receiverId) => {
		if (userPresenceSettingsMap.get(userId)?.showTypingStatus === false) {
			return;
		}
		const receiverSocketId = getReceiverSocketId(receiverId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("userRecordingStart", userId);
		}
	});

	socket.on("recording:stop", (receiverId) => {
		if (userPresenceSettingsMap.get(userId)?.showTypingStatus === false) {
			return;
		}
		const receiverSocketId = getReceiverSocketId(receiverId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("userRecordingStop", userId);
		}
	});

	socket.on("call:offer", ({ targetUserId, offer, callId, caller, mediaType } = {}) => {
		if (!userId || !targetUserId || !offer || !callId) return;
		emitToUserSockets(targetUserId, "call:offer", {
			callId,
			offer,
			caller,
			callerId: userId,
			mediaType: mediaType === "video" ? "video" : "voice",
		});
	});

	socket.on("call:answer", ({ targetUserId, answer, callId, responder, mediaType } = {}) => {
		if (!userId || !targetUserId || !answer || !callId) return;
		emitToUserSockets(targetUserId, "call:answer", {
			callId,
			answer,
			responder,
			responderId: userId,
			mediaType: mediaType === "video" ? "video" : "voice",
		});
	});

	socket.on("call:ice-candidate", ({ targetUserId, candidate, callId } = {}) => {
		if (!userId || !targetUserId || !candidate || !callId) return;
		emitToUserSockets(targetUserId, "call:ice-candidate", {
			callId,
			candidate,
			fromUserId: userId,
		});
	});

	socket.on("call:end", ({ targetUserId, callId, reason } = {}) => {
		if (!userId || !targetUserId || !callId) return;
		emitToUserSockets(targetUserId, "call:end", {
			callId,
			reason: reason || "ended",
			fromUserId: userId,
		});
	});

	socket.on("call:declined", ({ targetUserId, callId } = {}) => {
		if (!userId || !targetUserId || !callId) return;
		emitToUserSockets(targetUserId, "call:declined", {
			callId,
			fromUserId: userId,
		});
	});

	socket.on("call:busy", ({ targetUserId, callId } = {}) => {
		if (!userId || !targetUserId || !callId) return;
		emitToUserSockets(targetUserId, "call:busy", {
			callId,
			fromUserId: userId,
		});
	});

	socket.on("call:ringing-fast", ({ targetUserIds, call } = {}) => {
		if (!userId || !call?.callId) return;
		emitToUsers(targetUserIds, "call:ringing", { call });
	});

	socket.on("call:participant-joined-fast", ({ targetUserIds, callId, participant, mediaType } = {}) => {
		if (!userId || !callId || !participant?._id) return;
		emitToUsers(targetUserIds, "call:participant-joined", {
			callId,
			participant,
			mediaType: mediaType === "video" ? "video" : "voice",
		});
	});

	socket.on("call:participant-left-fast", ({ targetUserIds, callId, participantUserId } = {}) => {
		if (!userId || !callId || !participantUserId) return;
		emitToUsers(targetUserIds, "call:participant-left", {
			callId,
			participantUserId,
		});
	});

	socket.on("call:declined-fast", ({ targetUserIds, callId, userId: declinedUserId } = {}) => {
		if (!userId || !callId || !declinedUserId) return;
		emitToUsers(targetUserIds, "call:participant-declined", {
			callId,
			userId: declinedUserId,
		});
	});

	socket.on("call:ended-fast", ({ targetUserIds, callId, endedByUserId, reason } = {}) => {
		if (!userId || !callId) return;
		emitToUsers(targetUserIds, "call:ended", {
			callId,
			endedByUserId: endedByUserId || userId,
			reason: reason || "ended",
		});
	});

	socket.on("group-call:start", async ({ conversationId, callId, mediaType } = {}) => {
		if (!userId || !conversationId || !callId) return;

		try {
			const conversation = await getGroupConversationForCall(conversationId, userId);
			if (!conversation) return;

			const initiatorMember = conversation.members.find((member) => member.userId === userId);
			const initiator = toCallUser(initiatorMember?.user);
			if (!initiator) return;

			const memberIds = conversation.members.map((member) => member.userId);
			const summary = buildGroupConversationSummary(conversation);
			groupCallSessions.set(callId, {
				callId,
				conversationId,
				mediaType: mediaType === "video" ? "video" : "voice",
				initiatorId: userId,
				conversation: summary,
				participantIds: new Set([userId]),
				invitedUserIds: new Set(memberIds.filter((memberId) => memberId !== userId)),
			});

			emitToUsers(
				memberIds.filter((memberId) => memberId !== userId),
				"group-call:ringing",
				{
					callId,
					conversationId,
					mediaType: mediaType === "video" ? "video" : "voice",
					caller: initiator,
					initiatorId: userId,
					conversation: summary,
				}
			);
		} catch (error) {
			if (isPrismaConnectionError(error)) {
				console.warn("Skipped group call start because the database is temporarily unavailable.");
				return;
			}
			console.error("Error starting group call:", error.message);
		}
	});

	socket.on("group-call:join", async ({ callId } = {}) => {
		if (!userId || !callId) return;

		const session = groupCallSessions.get(callId);
		if (!session) return;

		try {
			const conversation = await getGroupConversationForCall(session.conversationId, userId);
			if (!conversation) return;

			const participantMember = conversation.members.find((member) => member.userId === userId);
			const participant = toCallUser(participantMember?.user);
			if (!participant) return;

			const existingParticipantIds = getGroupCallParticipantIds(session).filter((participantId) => participantId !== userId);
			session.participantIds.add(userId);
			session.invitedUserIds.delete(userId);

			const participants = conversation.members
				.filter((member) => session.participantIds.has(member.userId))
				.map((member) => toCallUser(member.user))
				.filter(Boolean);

			emitToUsers([userId], "group-call:participants", {
				callId,
				conversationId: session.conversationId,
				mediaType: session.mediaType,
				initiatorId: session.initiatorId,
				conversation: session.conversation,
				participants,
			});

			emitToUsers(existingParticipantIds, "group-call:participant-joined", {
				callId,
				participant,
				mediaType: session.mediaType,
				conversationId: session.conversationId,
			});
		} catch (error) {
			if (isPrismaConnectionError(error)) {
				console.warn("Skipped group call join because the database is temporarily unavailable.");
				return;
			}
			console.error("Error joining group call:", error.message);
		}
	});

	socket.on("group-call:leave", ({ callId } = {}) => {
		if (!userId || !callId) return;

		const session = groupCallSessions.get(callId);
		if (!session || !session.participantIds.has(userId)) return;

		session.participantIds.delete(userId);
		session.invitedUserIds.delete(userId);

		const targets = [...new Set([...getGroupCallParticipantIds(session), ...getGroupCallInvitedIds(session)])];
		emitToUsers(targets, "group-call:participant-left", {
			callId,
			participantUserId: userId,
		});

		if (session.participantIds.size === 0) {
			groupCallSessions.delete(callId);
		}
	});

	socket.on("group-call:end", ({ callId } = {}) => {
		if (!userId || !callId) return;

		const session = groupCallSessions.get(callId);
		if (!session) return;

		const targets = [...new Set([...getGroupCallParticipantIds(session), ...getGroupCallInvitedIds(session)])].filter(
			(targetUserId) => targetUserId !== userId
		);
		emitToUsers(targets, "group-call:ended", {
			callId,
			conversationId: session.conversationId,
			endedByUserId: userId,
		});
		groupCallSessions.delete(callId);
	});

	socket.on("group-call:declined", ({ callId, reason } = {}) => {
		if (!userId || !callId) return;

		const session = groupCallSessions.get(callId);
		if (!session) return;

		session.invitedUserIds.delete(userId);
		emitToUsers([session.initiatorId], "group-call:declined", {
			callId,
			userId,
			reason: reason || "declined",
		});
	});

	socket.on("group-call:offer", ({ targetUserId, offer, callId, caller, mediaType, conversationId } = {}) => {
		if (!userId || !targetUserId || !offer || !callId) return;
		emitToUserSockets(targetUserId, "group-call:offer", {
			callId,
			offer,
			caller,
			callerId: userId,
			mediaType: mediaType === "video" ? "video" : "voice",
			conversationId: conversationId || null,
		});
	});

	socket.on("group-call:answer", ({ targetUserId, answer, callId, responder, mediaType, conversationId } = {}) => {
		if (!userId || !targetUserId || !answer || !callId) return;
		emitToUserSockets(targetUserId, "group-call:answer", {
			callId,
			answer,
			responder,
			responderId: userId,
			mediaType: mediaType === "video" ? "video" : "voice",
			conversationId: conversationId || null,
		});
	});

	socket.on("group-call:ice-candidate", ({ targetUserId, candidate, callId, conversationId } = {}) => {
		if (!userId || !targetUserId || !candidate || !callId) return;
		emitToUserSockets(targetUserId, "group-call:ice-candidate", {
			callId,
			candidate,
			fromUserId: userId,
			conversationId: conversationId || null,
		});
	});

	// socket.on() is used to listen to the events. can be used both on client and server side
	socket.on("disconnect", () => {
		console.log("user disconnected", socket.id);
		if (userId && userId !== "undefined") {
			const existing = userSocketMap.get(userId);
			const presenceSettings = userPresenceSettingsMap.get(userId);
			if (existing) {
				existing.delete(socket.id);
				if (existing.size === 0) {
					userSocketMap.delete(userId);
					userPresenceSettingsMap.delete(userId);
					removeUserFromGroupCalls(userId);
					cleanupDisconnectedUserCalls(userId).catch((error) => {
						if (isPrismaConnectionError(error)) {
							console.warn("Skipped call cleanup because the database is temporarily unavailable.");
							return;
						}
						console.error("Error cleaning disconnected user calls:", error.message);
					});
					const lastSeen = new Date();
					prisma.user
						.update({ where: { id: userId }, data: { lastSeen } })
						.then(() => {
							if (presenceSettings?.showLastSeen !== false) {
								io.emit("userLastSeen", { userId, lastSeen: lastSeen.toISOString() });
							}
						})
						.catch((error) => {
							if (error?.code === "P2025") {
								return;
							}
							if (isPrismaConnectionError(error)) {
								console.warn("Skipped lastSeen update because the database is temporarily unavailable.");
								return;
							}
							console.error("Error updating lastSeen:", error.message);
						});
				} else {
					userSocketMap.set(userId, existing);
				}
			}
		}
		emitOnlineUsers();
	});
});

export { app, io, server };
