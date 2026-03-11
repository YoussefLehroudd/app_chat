import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError } from "../db/prisma.js";
import { emitConversationsRefreshRequired, emitToUsers } from "../utils/realtime.js";
import {
	createCallSessionRecord,
	declineCallSessionRecord,
	endCallSessionRecord,
	formatCallSessionForUser,
	getActiveCallUserIds,
	getCallDirectoryForUser,
	getCallSessionForUser,
	getInvitedCallUserIds,
	inviteUsersToCallSessionRecord,
	joinCallSessionRecord,
	leaveCallSessionRecord,
} from "../utils/calls.js";

const uniqueIds = (values) => [...new Set((values || []).filter(Boolean))];

const emitCallPayloadToUsers = (userIds, eventName, callSession) => {
	uniqueIds(userIds).forEach((userId) => {
		const call = formatCallSessionForUser(callSession, userId);
		if (!call) return;
		emitToUsers([userId], eventName, { call });
	});
};

const emitCallMessageUpdated = (formattedMessage, audienceUserIds) => {
	if (!formattedMessage) return;
	emitToUsers(audienceUserIds, "messageUpdated", formattedMessage);
	emitConversationsRefreshRequired(audienceUserIds, { conversationId: formattedMessage.conversationId });
};

const emitCallMessageCreated = (formattedMessage, audienceUserIds) => {
	if (!formattedMessage) return;
	emitToUsers(audienceUserIds, "newMessage", formattedMessage);
};

export const getCallDirectory = async (req, res) => {
	try {
		const calls = await getCallDirectoryForUser(req.user._id);
		res.status(200).json(calls);
	} catch (error) {
		console.error("Error in getCallDirectory:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const startCall = async (req, res) => {
	try {
		const userId = req.user._id;
		const { conversationId, targetUserId, mediaType, callId } = req.body || {};
		const createdCall = await createCallSessionRecord({
			userId,
			conversationId,
			targetUserId,
			mediaType,
			callId,
		});

		if (!createdCall?.callSession) {
			return res.status(400).json({ error: "Unable to start this call" });
		}

		const currentUserCall = formatCallSessionForUser(createdCall.callSession, userId);
		emitCallPayloadToUsers(createdCall.invitedUserIds, "call:ringing", createdCall.callSession);
		emitCallMessageCreated(createdCall.formattedMessage, createdCall.audienceUserIds);

		const liveAudienceIds = uniqueIds([
			userId,
			...createdCall.invitedUserIds,
			...createdCall.audienceUserIds,
		]);
		emitCallPayloadToUsers(liveAudienceIds, "call:participants", createdCall.callSession);

		res.status(201).json(currentUserCall);
	} catch (error) {
		console.error("Error in startCall:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const joinCall = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: callId } = req.params;
		const joinedCall = await joinCallSessionRecord({ callId, userId });

		if (!joinedCall?.callSession) {
			return res.status(404).json({ error: "Call not available" });
		}

		const currentUserCall = formatCallSessionForUser(joinedCall.callSession, userId);
		const activeUserIds = uniqueIds(getActiveCallUserIds(joinedCall.callSession));
		const invitedUserIds = uniqueIds(getInvitedCallUserIds(joinedCall.callSession));
		const callAudienceIds = uniqueIds([...activeUserIds, ...invitedUserIds]);

		emitCallMessageUpdated(joinedCall.formattedMessage, joinedCall.audienceUserIds);
		emitCallPayloadToUsers(callAudienceIds, "call:participants", joinedCall.callSession);
		emitToUsers(
			activeUserIds.filter((participantId) => participantId !== userId),
			"call:participant-joined",
			{
				callId,
				participant: req.user,
				mediaType: currentUserCall.mediaType,
			}
		);

		res.status(200).json(currentUserCall);
	} catch (error) {
		console.error("Error in joinCall:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const declineCall = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: callId } = req.params;
		const declinedCall = await declineCallSessionRecord({ callId, userId });

		if (!declinedCall?.callSession) {
			return res.status(404).json({ error: "Call not available" });
		}

		const activeUserIds = uniqueIds(getActiveCallUserIds(declinedCall.callSession));
		const invitedUserIds = uniqueIds(getInvitedCallUserIds(declinedCall.callSession));
		const liveAudienceIds = uniqueIds([...activeUserIds, ...invitedUserIds]);

		emitCallMessageUpdated(declinedCall.formattedMessage, declinedCall.audienceUserIds);
		emitCallPayloadToUsers(liveAudienceIds, "call:participants", declinedCall.callSession);
		emitToUsers(activeUserIds.filter((participantId) => participantId !== userId), "call:participant-declined", {
			callId,
			userId,
		});

		res.status(200).json({ message: "Call declined" });
	} catch (error) {
		console.error("Error in declineCall:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const inviteUsersToCall = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: callId } = req.params;
		const { userIds } = req.body || {};
		const updatedCall = await inviteUsersToCallSessionRecord({
			callId,
			inviterId: userId,
			userIds,
		});

		if (!updatedCall?.callSession) {
			return res.status(404).json({ error: "Call not available" });
		}

		const activeUserIds = uniqueIds(getActiveCallUserIds(updatedCall.callSession));
		const invitedUserIds = uniqueIds(getInvitedCallUserIds(updatedCall.callSession));
		const liveAudienceIds = uniqueIds([...activeUserIds, ...invitedUserIds]);

		emitCallMessageUpdated(updatedCall.formattedMessage, updatedCall.audienceUserIds);
		emitCallPayloadToUsers(liveAudienceIds, "call:participants", updatedCall.callSession);
		emitCallPayloadToUsers(updatedCall.invitedUserIds, "call:ringing", updatedCall.callSession);

		res.status(200).json(formatCallSessionForUser(updatedCall.callSession, userId));
	} catch (error) {
		console.error("Error in inviteUsersToCall:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const leaveCall = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: callId } = req.params;
		const updatedCall = await leaveCallSessionRecord({ callId, userId });

		if (!updatedCall?.callSession) {
			return res.status(404).json({ error: "Call not available" });
		}

		const activeUserIds = uniqueIds(getActiveCallUserIds(updatedCall.callSession));
		const invitedUserIds = uniqueIds(getInvitedCallUserIds(updatedCall.callSession));
		const liveAudienceIds = uniqueIds([...activeUserIds, ...invitedUserIds]);

		emitCallMessageUpdated(updatedCall.formattedMessage, updatedCall.audienceUserIds);
		emitCallPayloadToUsers(liveAudienceIds, "call:participants", updatedCall.callSession);
		if (updatedCall.callSession.status === "ENDED") {
			emitToUsers(liveAudienceIds.filter((participantId) => participantId !== userId), "call:ended", {
				callId,
				endedByUserId: userId,
			});
		} else {
			emitToUsers(liveAudienceIds.filter((participantId) => participantId !== userId), "call:participant-left", {
				callId,
				participantUserId: userId,
			});
		}

		res.status(200).json({ message: "Left call" });
	} catch (error) {
		console.error("Error in leaveCall:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const endCall = async (req, res) => {
	try {
		const userId = req.user._id;
		const { id: callId } = req.params;
		const updatedCall = await endCallSessionRecord({ callId, endedById: userId });

		if (!updatedCall?.callSession) {
			return res.status(404).json({ error: "Call not available" });
		}

		const activeUserIds = uniqueIds(getActiveCallUserIds(updatedCall.callSession));
		const invitedUserIds = uniqueIds(getInvitedCallUserIds(updatedCall.callSession));
		const liveAudienceIds = uniqueIds([
			...activeUserIds,
			...invitedUserIds,
			...updatedCall.callSession.participants.map((participant) => participant.userId),
		]);

		emitCallMessageUpdated(updatedCall.formattedMessage, updatedCall.audienceUserIds);
		emitCallPayloadToUsers(liveAudienceIds, "call:participants", updatedCall.callSession);
		emitToUsers(liveAudienceIds.filter((participantId) => participantId !== userId), "call:ended", {
			callId,
			endedByUserId: userId,
		});

		res.status(200).json({ message: "Call ended" });
	} catch (error) {
		console.error("Error in endCall:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const getCallById = async (req, res) => {
	try {
		const callSession = await getCallSessionForUser(req.params.id, req.user._id);
		if (!callSession) {
			return res.status(404).json({ error: "Call not found" });
		}

		res.status(200).json(formatCallSessionForUser(callSession, req.user._id));
	} catch (error) {
		console.error("Error in getCallById:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};
