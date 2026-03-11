import { createContext, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "./AuthContext";
import { useSocketContext } from "./SocketContext";

const DEFAULT_ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const PUBLIC_TURN_FALLBACK_SERVERS = [
	{
		urls: [
			"turn:openrelay.metered.ca:80",
			"turn:openrelay.metered.ca:443",
			"turns:openrelay.metered.ca:443?transport=tcp",
		],
		username: "openrelayproject",
		credential: "openrelayproject",
	},
];

const normalizeIceServer = (server) => {
	if (!server || typeof server !== "object") return null;

	const urls = (Array.isArray(server.urls) ? server.urls : [server.urls])
		.map((url) => (typeof url === "string" ? url.trim() : ""))
		.filter(Boolean);

	if (urls.length === 0) return null;

	const normalizedServer = { urls };
	if (typeof server.username === "string" && server.username.trim()) {
		normalizedServer.username = server.username.trim();
	}
	if (typeof server.credential === "string" && server.credential.trim()) {
		normalizedServer.credential = server.credential.trim();
	}
	if (typeof server.credentialType === "string" && server.credentialType.trim()) {
		normalizedServer.credentialType = server.credentialType.trim();
	}

	return normalizedServer;
};

const parseIceServersFromEnv = () => {
	const rawValue = import.meta.env?.VITE_WEBRTC_ICE_SERVERS;
	if (typeof rawValue !== "string" || !rawValue.trim()) {
		return [];
	}

	try {
		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) {
			return [];
		}

		return parsedValue.map(normalizeIceServer).filter(Boolean);
	} catch {
		return [];
	}
};

const ICE_SERVERS = (() => {
	const envIceServers = parseIceServersFromEnv();
	if (envIceServers.length > 0) {
		return envIceServers;
	}

	return [...DEFAULT_ICE_SERVERS, ...PUBLIC_TURN_FALLBACK_SERVERS];
})();
const CALL_STATUSES = {
	RINGING: "RINGING",
	ACTIVE: "ACTIVE",
	ENDED: "ENDED",
};
const CALL_PARTICIPANT_STATUSES = {
	INVITED: "INVITED",
	JOINED: "JOINED",
	DECLINED: "DECLINED",
	MISSED: "MISSED",
};

const INITIAL_CALL_STATE = {
	phase: "idle",
	direction: null,
	callId: "",
	callMode: "direct",
	conversationId: null,
	conversationTitle: "",
	conversationProfilePic: "",
	otherUser: null,
	mediaType: "voice",
	initiatorId: null,
	isScreenSharing: false,
	isMuted: false,
	startedAt: null,
	connectedAt: null,
	endedAt: null,
	callMessageId: null,
	participants: [],
	currentUserStatus: null,
	activeParticipantCount: 0,
	joinedParticipantCount: 0,
	canJoin: false,
	canInvite: false,
};

const CallContext = createContext(null);

const buildAudioConstraints = () => ({
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
});

const isFirefoxBrowser = () =>
	typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent || "");

const wait = (durationMs) =>
	new Promise((resolve) => {
		window.setTimeout(resolve, durationMs);
	});

const buildVideoConstraintPresets = () => [
	{
		audio: buildAudioConstraints(),
		video: {
			facingMode: "user",
			width: { ideal: 1280 },
			height: { ideal: 720 },
			frameRate: { ideal: 24, max: 30 },
		},
	},
	{
		audio: buildAudioConstraints(),
		video: {
			facingMode: "user",
			width: { ideal: 960 },
			height: { ideal: 540 },
		},
	},
	{
		audio: buildAudioConstraints(),
		video: true,
	},
];

const buildVideoOnlyConstraintPresets = () =>
	isFirefoxBrowser()
		? [
				{ audio: false, video: true },
				{
					audio: false,
					video: {
						width: { ideal: 960 },
						height: { ideal: 540 },
					},
				},
				{
					audio: false,
					video: {
						facingMode: { ideal: "user" },
					},
				},
		  ]
		: [
				{
					audio: false,
					video: {
						facingMode: "user",
						width: { ideal: 1280 },
						height: { ideal: 720 },
						frameRate: { ideal: 24, max: 30 },
					},
				},
				{
					audio: false,
					video: {
						width: { ideal: 960 },
						height: { ideal: 540 },
					},
				},
				{ audio: false, video: true },
		  ];

const shouldRetryVideoCapture = (error) => {
	const message = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
	return (
		error?.name === "NotReadableError" ||
		error?.name === "AbortError" ||
		error?.name === "OverconstrainedError" ||
		message.includes("failed to allocate videosource") ||
		message.includes("could not start video source") ||
		message.includes("device in use")
	);
};

const getCallApiSupportError = (mediaType = "voice") => {
	if (typeof window === "undefined" || typeof navigator === "undefined") {
		return "Calls are not available in this environment";
	}

	if (!window.RTCPeerConnection) {
		return "This browser does not support calls";
	}

	if (!navigator.mediaDevices?.getUserMedia) {
		return mediaType === "video"
			? "Camera and microphone access are not available in this browser"
			: "Microphone access is not available in this browser";
	}

	return "";
};

const buildMediaAccessError = (error, mediaType = "voice", usedAudioFallback = false) => {
	if (mediaType === "video") {
		const message = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
		if (
			error?.name === "NotReadableError" ||
			error?.name === "AbortError" ||
			message.includes("failed to allocate videosource") ||
			message.includes("device in use")
		) {
			return new Error(
				usedAudioFallback
					? "Camera unavailable. Joined with microphone only."
					: "Camera is busy right now. Close other apps using it and try again."
			);
		}
	}

	return error instanceof Error ? error : new Error(`Unable to access ${mediaType} devices`);
};

const stopStreamTracks = (stream) => {
	stream?.getTracks?.().forEach((track) => track.stop());
};

const mergeMediaStreams = ({ videoStream, audioStream }) =>
	new MediaStream([
		...(videoStream?.getVideoTracks?.() || []),
		...(audioStream?.getAudioTracks?.() || []),
	]);

const getUserIdKey = (userOrId) => (typeof userOrId === "string" ? userOrId : userOrId?._id || "");
const createClientCallId = () =>
	globalThis.crypto?.randomUUID?.() || `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const toIsoString = (value = new Date()) => (value instanceof Date ? value.toISOString() : value);

const uniqueUsers = (users) => {
	const seen = new Set();
	return users.filter((user) => {
		if (!user?._id || seen.has(user._id)) return false;
		seen.add(user._id);
		return true;
	});
};

const isCurrentUserActive = (participants, authUserId) => {
	const currentParticipant = (participants || []).find((participant) => participant.userId === authUserId);
	return Boolean(currentParticipant?.joinedAt && !currentParticipant?.leftAt);
};

const isJoinedParticipant = (participant) => Boolean(participant?.joinedAt);
const isActiveParticipant = (participant) => Boolean(participant?.joinedAt && !participant?.leftAt);

const getParticipantMetrics = (participants = []) => ({
	joinedParticipantCount: participants.filter(isJoinedParticipant).length,
	activeParticipantCount: participants.filter(isActiveParticipant).length,
	invitedCount: participants.filter((participant) => participant.status === CALL_PARTICIPANT_STATUSES.INVITED).length,
});

const upsertParticipantRecord = (participants = [], nextParticipant) => {
	if (!nextParticipant?.userId) return participants;

	const existingIndex = participants.findIndex((participant) => participant.userId === nextParticipant.userId);
	if (existingIndex === -1) {
		return [...participants, nextParticipant];
	}

	const mergedParticipants = [...participants];
	mergedParticipants[existingIndex] = {
		...mergedParticipants[existingIndex],
		...nextParticipant,
		user: nextParticipant.user || mergedParticipants[existingIndex].user,
		invitedBy: nextParticipant.invitedBy ?? mergedParticipants[existingIndex].invitedBy,
	};
	return mergedParticipants;
};

const mergeParticipantsWithLocalState = (incomingParticipants = [], currentParticipants = []) => {
	const participantMap = new Map(currentParticipants.map((participant) => [participant.userId, participant]));

	for (const participant of incomingParticipants) {
		const currentParticipant = participantMap.get(participant.userId);

		if (
			currentParticipant?.joinedAt &&
			!participant?.joinedAt &&
			!currentParticipant.leftAt
		) {
			participantMap.set(participant.userId, {
				...participant,
				joinedAt: currentParticipant.joinedAt,
				status: CALL_PARTICIPANT_STATUSES.JOINED,
				isActive: true,
				user: currentParticipant.user || participant.user,
				invitedBy: currentParticipant.invitedBy ?? participant.invitedBy,
			});
			continue;
		}

		participantMap.set(participant.userId, {
			...currentParticipant,
			...participant,
			user: participant.user || currentParticipant?.user,
			invitedBy: participant.invitedBy ?? currentParticipant?.invitedBy,
		});
	}

	return Array.from(participantMap.values());
};

const buildCallStateFromDto = (call, currentState = INITIAL_CALL_STATE, overrides = {}) => ({
	phase: overrides.phase ?? currentState.phase,
	direction: overrides.direction ?? currentState.direction,
	callId: call.callId,
	callMode: call.callMode || "direct",
	conversationId: call.conversationId || null,
	conversationTitle: call.title || call.conversation?.fullName || "",
	conversationProfilePic: call.profilePic || call.conversation?.profilePic || "",
	otherUser: call.otherUsers?.[0] || call.initiator || null,
	mediaType: call.mediaType === "video" ? "video" : "voice",
	initiatorId: call.initiator?._id || call.initiatorId || null,
	isScreenSharing: overrides.isScreenSharing ?? currentState.isScreenSharing,
	isMuted: overrides.isMuted ?? currentState.isMuted,
	startedAt: call.startedAt || null,
	connectedAt: call.connectedAt || currentState.connectedAt || null,
	endedAt: call.endedAt || null,
	callMessageId: call.callMessageId || null,
	participants: Array.isArray(call.participants) ? call.participants : [],
	currentUserStatus: call.currentUserStatus || null,
	activeParticipantCount: Number.isFinite(call.activeParticipantCount) ? call.activeParticipantCount : 0,
	joinedParticipantCount: Number.isFinite(call.joinedParticipantCount) ? call.joinedParticipantCount : 0,
	canJoin: Boolean(call.canJoin),
	canInvite: Boolean(call.canInvite),
});

const requestJson = async (url, options = {}) => {
	const response = await fetch(url, options);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(data.error || "Request failed");
	}

	return data;
};

const requestJsonWithRetry = async (
	url,
	options = {},
	{ retries = 10, delayMs = 180, shouldRetry = () => false } = {}
) => {
	let attempt = 0;

	while (true) {
		try {
			return await requestJson(url, options);
		} catch (error) {
			if (attempt >= retries || !shouldRetry(error, attempt)) {
				throw error;
			}

			attempt += 1;
			await wait(delayMs);
		}
	}
};

export const useCallContext = () => useContext(CallContext);

export const CallContextProvider = ({ children }) => {
	const { authUser } = useAuthContext();
	const { socket, isSocketConnected } = useSocketContext();
	const [callState, setCallState] = useState(INITIAL_CALL_STATE);
	const [localStream, setLocalStream] = useState(null);
	const [remoteParticipants, setRemoteParticipants] = useState([]);
	const [callDurationSeconds, setCallDurationSeconds] = useState(0);

	const callStateRef = useRef(INITIAL_CALL_STATE);
	const socketRef = useRef(null);
	const authUserRef = useRef(null);
	const localStreamRef = useRef(null);
	const cameraStreamRef = useRef(null);
	const screenStreamRef = useRef(null);
	const peerConnectionsRef = useRef(new Map());
	const participantDirectoryRef = useRef(new Map());
	const pendingIceCandidatesRef = useRef(new Map());
	const inboundRemoteStreamsRef = useRef(new Map());
	const durationIntervalRef = useRef(null);
	const incomingCallRef = useRef(null);
	const recentlyClosedCallsRef = useRef(new Map());

	const computeCallDurationSeconds = (call, endedAt = new Date()) => {
		const endedAtDate = endedAt instanceof Date ? endedAt : new Date(endedAt);
		const startedAtSource = call?.connectedAt || call?.startedAt;
		if (!startedAtSource) return Number(call?.durationSeconds) || 0;

		const startedAtDate = new Date(startedAtSource);
		const endedAtMs = endedAtDate.getTime();
		const startedAtMs = startedAtDate.getTime();
		if (!Number.isFinite(endedAtMs) || !Number.isFinite(startedAtMs)) {
			return Number(call?.durationSeconds) || 0;
		}

		return Math.max(0, Math.round((endedAtMs - startedAtMs) / 1000));
	};

	const formatDurationLabel = (totalSeconds = 0) => {
		const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
		const hours = Math.floor(safeSeconds / 3600);
		const minutes = Math.floor((safeSeconds % 3600) / 60);
		const seconds = safeSeconds % 60;

		if (hours > 0) {
			return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
		}

		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	};

	const buildClosedCallSnapshot = (call, endedAt = new Date()) => {
		if (!call?.callId) {
			return {
				status: CALL_STATUSES.ENDED,
				endedAt: toIsoString(endedAt),
			};
		}

		const durationSeconds = Math.max(Number(call.durationSeconds) || 0, computeCallDurationSeconds(call, endedAt));
		const mediaLabel = call.mediaType === "video" ? "Video call" : "Voice call";
		const joinedCount =
			Number(call.joinedParticipantCount) ||
			Number(call.activeParticipantCount) ||
			((call.participants || []).filter((participant) => participant.joinedAt).length || 0);

		return {
			status: CALL_STATUSES.ENDED,
			endedAt: toIsoString(endedAt),
			durationSeconds,
			activeParticipantCount: 0,
			joinedParticipantCount: joinedCount,
			previewText: durationSeconds > 0 ? `${mediaLabel} · ${formatDurationLabel(durationSeconds)}` : `${mediaLabel} ended`,
		};
	};

	useEffect(() => {
		callStateRef.current = callState;
	}, [callState]);

	useEffect(() => {
		socketRef.current = socket;
	}, [socket]);

	useEffect(() => {
		authUserRef.current = authUser;
	}, [authUser]);

	const purgeExpiredClosedCalls = () => {
		const now = Date.now();
		for (const [callId, record] of recentlyClosedCallsRef.current.entries()) {
			if (!callId || !record?.expiresAt || record.expiresAt <= now) {
				recentlyClosedCallsRef.current.delete(callId);
			}
		}
	};

	const markCallAsRecentlyClosed = (callId, ttlMs = 180000, snapshot = null) => {
		if (!callId) return;
		purgeExpiredClosedCalls();
		const existingRecord = recentlyClosedCallsRef.current.get(callId);
		recentlyClosedCallsRef.current.set(callId, {
			expiresAt: Date.now() + ttlMs,
			snapshot: snapshot || existingRecord?.snapshot || null,
		});
	};

	const clearRecentlyClosedCall = (callId) => {
		if (!callId) return;
		recentlyClosedCallsRef.current.delete(callId);
	};

	const isCallRecentlyClosed = (callId) => {
		if (!callId) return false;
		purgeExpiredClosedCalls();
		const record = recentlyClosedCallsRef.current.get(callId);
		if (!record?.expiresAt) return false;
		if (record.expiresAt <= Date.now()) {
			recentlyClosedCallsRef.current.delete(callId);
			return false;
		}
		return true;
	};

	const getClosedCallSnapshot = (callId) => {
		if (!isCallRecentlyClosed(callId)) return null;
		return recentlyClosedCallsRef.current.get(callId)?.snapshot || null;
	};

	const getOtherCallUserIds = (call, options = {}) => {
		const { joinedOnly = false, activeOnly = false } = options;
		const currentUserId = authUserRef.current?._id || "";

		return [...new Set(
			(call?.participants || [])
				.filter((participant) => participant.userId && participant.userId !== currentUserId)
				.filter((participant) => {
					if (activeOnly) return isActiveParticipant(participant);
					if (joinedOnly) return isJoinedParticipant(participant);
					return true;
				})
				.map((participant) => participant.userId)
		)];
	};

	const normalizeIncomingCallForViewer = (call) => {
		if (!call?.callId) return call;

		const viewerId = authUserRef.current?._id || "";
		const isGroupCall =
			call.callMode === "group" ||
			call.conversationType === "GROUP" ||
			call.conversation?.type === "GROUP";
		if (isGroupCall) {
			return call;
		}

		const callInitiatorId = call.initiator?._id || call.initiatorId || "";
		if (!callInitiatorId || callInitiatorId === viewerId) {
			return call;
		}

		const otherUsers = Array.isArray(call.otherUsers)
			? call.otherUsers.filter((user) => user?._id && user._id !== viewerId)
			: [];
		const primaryOtherUser = otherUsers[0] || call.initiator || null;

		return {
			...call,
			otherUsers: primaryOtherUser ? [primaryOtherUser] : otherUsers,
			title: primaryOtherUser?.fullName || call.title,
			profilePic: primaryOtherUser?.profilePic || call.profilePic || "",
		};
	};

	const buildOptimisticParticipant = ({ user, status, joinedAt = null, invitedBy = null }) => ({
		_id: `${user._id}:${status.toLowerCase()}`,
		userId: user._id,
		status,
		invitedAt: joinedAt || toIsoString(),
		joinedAt,
		leftAt: null,
		isActive: status === CALL_PARTICIPANT_STATUSES.JOINED && !joinedAt ? false : Boolean(joinedAt),
		user,
		invitedBy,
	});

	const buildOptimisticCall = ({ target, mediaType, callId }) => {
		const currentUser = authUserRef.current;
		const startedAt = toIsoString();
		const isGroupCall = target?.type === "GROUP";
		const groupMembers = Array.isArray(target?.members)
			? target.members.filter((member) => member?._id && member._id !== currentUser?._id)
			: [];
		const otherUsers = uniqueUsers(
			isGroupCall ? groupMembers : target?._id ? [target] : []
		);
		const participants = [
			buildOptimisticParticipant({
				user: currentUser,
				status: CALL_PARTICIPANT_STATUSES.JOINED,
				joinedAt: startedAt,
			}),
			...otherUsers.map((user) =>
				buildOptimisticParticipant({
					user,
					status: CALL_PARTICIPANT_STATUSES.INVITED,
					invitedBy: currentUser,
				})
			),
		];
		const metrics = getParticipantMetrics(participants);

		return {
			_id: callId,
			callId,
			callMessageId: null,
			conversationId: isGroupCall ? target?._id || null : target?.conversationId || null,
			conversationType: isGroupCall ? "GROUP" : "DIRECT",
			callMode: isGroupCall ? "group" : "direct",
			mediaType,
			status: CALL_STATUSES.RINGING,
			title: target?.fullName || "Call",
			profilePic: target?.profilePic || "",
			startedAt,
			connectedAt: null,
			endedAt: null,
			durationSeconds: 0,
			participantCount: participants.length,
			joinedParticipantCount: metrics.joinedParticipantCount,
			activeParticipantCount: metrics.activeParticipantCount,
			invitedCount: metrics.invitedCount,
			previewText: `${currentUser?.fullName || "Someone"} is calling`,
			initiator: currentUser,
			endedBy: null,
			currentUserStatus: CALL_PARTICIPANT_STATUSES.JOINED,
			isCurrentUserActive: true,
			canJoin: false,
			canInvite: true,
			participants,
			otherUsers,
			conversation: {
				_id: isGroupCall ? target?._id || null : target?.conversationId || null,
				type: isGroupCall ? "GROUP" : "DIRECT",
				fullName: target?.fullName || "Call",
				profilePic: target?.profilePic || "",
				isPrivate: Boolean(target?.isPrivate),
				memberCount: isGroupCall ? participants.length : 2,
			},
		};
	};

	const emitFastSocketEvent = (eventName, payload) => {
		if (!socketRef.current?.connected) return;
		socketRef.current.emit(eventName, payload);
	};

	const updateCallState = (updater) => {
		setCallState((currentState) => {
			const nextState = typeof updater === "function" ? updater(currentState) : updater;
			callStateRef.current = nextState;
			return nextState;
		});
	};

	const syncParticipantLocally = (user, nextFields = {}) => {
		const participantUserId = getUserIdKey(user || nextFields.userId);
		if (!participantUserId) return;
		const nowIso = toIsoString();

		updateCallState((currentState) => {
			if (!currentState.callId) {
				return currentState;
			}

			const existingParticipant =
				currentState.participants.find((participant) => participant.userId === participantUserId) || null;

			const nextParticipants = upsertParticipantRecord(currentState.participants, {
				_id: `${currentState.callId}:${participantUserId}`,
				userId: participantUserId,
				status: nextFields.status || existingParticipant?.status || CALL_PARTICIPANT_STATUSES.JOINED,
				invitedAt:
					nextFields.invitedAt || existingParticipant?.invitedAt || currentState.startedAt || toIsoString(),
				joinedAt:
					nextFields.joinedAt !== undefined ? nextFields.joinedAt : existingParticipant?.joinedAt || null,
				leftAt: nextFields.leftAt !== undefined ? nextFields.leftAt : existingParticipant?.leftAt || null,
				isActive:
					nextFields.isActive ??
					Boolean(
						(nextFields.joinedAt !== undefined ? nextFields.joinedAt : existingParticipant?.joinedAt) &&
							!(nextFields.leftAt !== undefined ? nextFields.leftAt : existingParticipant?.leftAt)
					),
				user:
					(typeof user === "string" ? null : user) ||
					existingParticipant?.user ||
					null,
				invitedBy:
					nextFields.invitedBy ?? existingParticipant?.invitedBy ?? null,
			});
			const metrics = getParticipantMetrics(nextParticipants);
			const currentUserJoinedAndActive = isCurrentUserActive(nextParticipants, authUserRef.current?._id || "");
			const shouldMarkConnected = metrics.activeParticipantCount >= 2 && currentUserJoinedAndActive;
			const nextConnectedAt = shouldMarkConnected ? currentState.connectedAt || nowIso : currentState.connectedAt;

			return {
				...currentState,
				status: metrics.activeParticipantCount > 1 ? CALL_STATUSES.ACTIVE : currentState.status,
				phase:
					shouldMarkConnected && currentState.phase !== "idle" ? "active" : currentState.phase,
				connectedAt: nextConnectedAt,
				participants: nextParticipants,
				participantCount: nextParticipants.length,
				joinedParticipantCount: metrics.joinedParticipantCount,
				activeParticipantCount: metrics.activeParticipantCount,
				invitedCount: metrics.invitedCount,
				currentUserStatus:
					participantUserId === authUserRef.current?._id
						? nextFields.status || CALL_PARTICIPANT_STATUSES.JOINED
						: currentState.currentUserStatus,
			};
		});
	};

	const stopDurationTimer = (shouldReset = true) => {
		if (durationIntervalRef.current) {
			window.clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}

		if (shouldReset) {
			setCallDurationSeconds(0);
		}
	};

	const startDurationTimer = (connectedAt) => {
		if (!connectedAt) return;

		stopDurationTimer(false);
		const referenceTime = new Date(connectedAt).getTime();
		const updateDuration = () => {
			setCallDurationSeconds(Math.max(0, Math.floor((Date.now() - referenceTime) / 1000)));
		};

		updateDuration();
		durationIntervalRef.current = window.setInterval(updateDuration, 1000);
	};

	useEffect(() => {
		if (callState.phase !== "active" || !callState.connectedAt) {
			return;
		}

		startDurationTimer(callState.connectedAt);
	}, [callState.phase, callState.connectedAt]);

	const registerParticipants = (participants) => {
		const nextUsers = uniqueUsers((participants || []).map((participant) => participant?.user).filter(Boolean));
		participantDirectoryRef.current = new Map(nextUsers.map((user) => [user._id, user]));
	};

	const registerParticipant = (user) => {
		if (!user?._id) return;
		participantDirectoryRef.current.set(user._id, user);
	};

	const setRemoteParticipantStream = (userId, stream) => {
		if (!userId || !stream) return;

		const user =
			participantDirectoryRef.current.get(userId) ||
			callStateRef.current.participants.find((participant) => participant.userId === userId)?.user ||
			null;

		setRemoteParticipants((currentParticipants) => {
			const participantIndex = currentParticipants.findIndex(
				(participant) => participant.userId === userId || participant.user?._id === userId
			);
			if (participantIndex === -1) {
				return [...currentParticipants, { userId, user, stream }];
			}

			const nextParticipants = [...currentParticipants];
			nextParticipants[participantIndex] = {
				userId,
				user: user || nextParticipants[participantIndex].user,
				stream,
			};
			return nextParticipants;
		});
	};

	const removeRemoteParticipant = (userId) => {
		if (!userId) return;
		inboundRemoteStreamsRef.current.delete(userId);
		setRemoteParticipants((currentParticipants) =>
			currentParticipants.filter(
				(participant) => participant.userId !== userId && participant.user?._id !== userId
			)
		);
	};

	const queueIceCandidate = (userId, candidate) => {
		if (!userId || !candidate) return;
		const currentCandidates = pendingIceCandidatesRef.current.get(userId) || [];
		pendingIceCandidatesRef.current.set(userId, [...currentCandidates, candidate]);
	};

	const flushPendingIceCandidates = async (userId) => {
		const connection = peerConnectionsRef.current.get(userId);
		const queuedCandidates = pendingIceCandidatesRef.current.get(userId) || [];
		if (!connection || queuedCandidates.length === 0) {
			return;
		}

		pendingIceCandidatesRef.current.delete(userId);
		for (const candidate of queuedCandidates) {
			try {
				await connection.addIceCandidate(new RTCIceCandidate(candidate));
			} catch (error) {
				console.error("Error applying queued ICE candidate:", error);
			}
		}
	};

	const closePeerConnection = (userId) => {
		const connection = peerConnectionsRef.current.get(userId);
		if (!connection) return;

		connection.onicecandidate = null;
		connection.ontrack = null;
		connection.onconnectionstatechange = null;
		connection.oniceconnectionstatechange = null;
		connection.close();
		peerConnectionsRef.current.delete(userId);
		pendingIceCandidatesRef.current.delete(userId);
		removeRemoteParticipant(userId);
	};

	const closeAllPeerConnections = () => {
		Array.from(peerConnectionsRef.current.keys()).forEach((userId) => closePeerConnection(userId));
	};

	const stopLocalStream = () => {
		const streamsToStop = new Set([localStreamRef.current, cameraStreamRef.current, screenStreamRef.current]);
		streamsToStop.forEach((stream) => stopStreamTracks(stream));
		localStreamRef.current = null;
		cameraStreamRef.current = null;
		screenStreamRef.current = null;
		setLocalStream(null);
	};

	const resetCallLocally = () => {
		stopDurationTimer();
		stopLocalStream();
		closeAllPeerConnections();
		incomingCallRef.current = null;
		participantDirectoryRef.current = new Map();
		pendingIceCandidatesRef.current = new Map();
		inboundRemoteStreamsRef.current = new Map();
		setRemoteParticipants([]);
		callStateRef.current = INITIAL_CALL_STATE;
		setCallState(INITIAL_CALL_STATE);
	};

	const getUserMediaStream = async (mediaType = "voice", options = {}) => {
		const { allowAudioFallback = false } = options;
		const supportError = getCallApiSupportError(mediaType);
		if (supportError) {
			throw new Error(supportError);
		}

		if (mediaType !== "video") {
			return navigator.mediaDevices.getUserMedia({
				audio: buildAudioConstraints(),
				video: false,
			});
		}

		let lastError = null;
		for (const constraints of buildVideoConstraintPresets()) {
			try {
				return await navigator.mediaDevices.getUserMedia(constraints);
			} catch (error) {
				lastError = error;
				if (!shouldRetryVideoCapture(error)) {
					break;
				}
			}
		}

		let videoOnlyStream = null;
		let audioOnlyStream = null;

		try {
			for (const constraints of buildVideoOnlyConstraintPresets()) {
				try {
					videoOnlyStream = await navigator.mediaDevices.getUserMedia(constraints);
					break;
				} catch (error) {
					lastError = error;
					if (!shouldRetryVideoCapture(error)) {
						break;
					}
					await wait(120);
				}
			}

			if (videoOnlyStream) {
				audioOnlyStream = await navigator.mediaDevices.getUserMedia({
					audio: buildAudioConstraints(),
					video: false,
				});

				return mergeMediaStreams({
					videoStream: videoOnlyStream,
					audioStream: audioOnlyStream,
				});
			}
		} catch (error) {
			lastError = error;
			stopStreamTracks(videoOnlyStream);
			stopStreamTracks(audioOnlyStream);
		}

		if (allowAudioFallback) {
			try {
				return await navigator.mediaDevices.getUserMedia({
					audio: buildAudioConstraints(),
					video: false,
				});
			} catch (audioFallbackError) {
				lastError = audioFallbackError;
			}
		}

		throw buildMediaAccessError(lastError, mediaType, allowAudioFallback);
	};

	const prepareLocalStream = async (mediaType, options = {}) => {
		const stream = await getUserMediaStream(mediaType, options);

		if (mediaType === "video") {
			cameraStreamRef.current = stream;
		}

		localStreamRef.current = stream;
		setLocalStream(stream);

		if (mediaType === "video" && stream.getVideoTracks().length === 0) {
			toast("Camera unavailable. Joined with microphone only.");
		}

		if (callStateRef.current.isMuted) {
			stream.getAudioTracks().forEach((track) => {
				track.enabled = false;
			});
		}

		return stream;
	};

	const replaceOutgoingVideoTrack = async (nextTrack) => {
		const replaceOperations = [];

		peerConnectionsRef.current.forEach((connection) => {
			const videoSender = connection
				.getSenders()
				.find((sender) => sender.track?.kind === "video" || sender.track === null);
			if (!videoSender) return;
			replaceOperations.push(videoSender.replaceTrack(nextTrack || null));
		});

		if (replaceOperations.length > 0) {
			await Promise.allSettled(replaceOperations);
		}
	};

	const stopScreenShare = async ({ preserveCamera = true } = {}) => {
		const displayStream = screenStreamRef.current;
		if (!displayStream) {
			updateCallState((currentState) => ({
				...currentState,
				isScreenSharing: false,
			}));
			return;
		}

		const activeTrack = displayStream.getVideoTracks()[0];
		if (activeTrack) {
			activeTrack.onended = null;
		}

		screenStreamRef.current = null;
		stopStreamTracks(displayStream);

		const fallbackStream = preserveCamera ? cameraStreamRef.current : null;
		const fallbackVideoTrack = fallbackStream?.getVideoTracks?.()[0] || null;

		await replaceOutgoingVideoTrack(fallbackVideoTrack);

		if (fallbackStream) {
			localStreamRef.current = fallbackStream;
			setLocalStream(fallbackStream);
		} else {
			localStreamRef.current = null;
			setLocalStream(null);
		}

		updateCallState((currentState) => ({
			...currentState,
			isScreenSharing: false,
		}));
	};

	const toggleScreenShare = async () => {
		if (callStateRef.current.mediaType !== "video") {
			toast.error("Screen sharing works in video calls only");
			return;
		}

		if (!navigator.mediaDevices?.getDisplayMedia) {
			toast.error("Screen sharing is not supported in this browser");
			return;
		}

		if (callStateRef.current.phase === "idle" || callStateRef.current.phase === "incoming") {
			toast.error("Join the call first");
			return;
		}

		if (callStateRef.current.isScreenSharing) {
			await stopScreenShare();
			return;
		}

		try {
			const displayStream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					frameRate: { ideal: 12, max: 30 },
				},
				audio: false,
			});
			const displayTrack = displayStream.getVideoTracks()[0];

			if (!displayTrack) {
				stopStreamTracks(displayStream);
				throw new Error("No screen video track available");
			}

			displayTrack.onended = () => {
				void stopScreenShare();
			};

			screenStreamRef.current = displayStream;

			const baseStream = cameraStreamRef.current || localStreamRef.current;
			const mergedStream = mergeMediaStreams({
				videoStream: displayStream,
				audioStream: baseStream,
			});

			if (callStateRef.current.isMuted) {
				mergedStream.getAudioTracks().forEach((track) => {
					track.enabled = false;
				});
			}

			localStreamRef.current = mergedStream;
			setLocalStream(mergedStream);
			await replaceOutgoingVideoTrack(displayTrack);

			updateCallState((currentState) => ({
				...currentState,
				isScreenSharing: true,
			}));
		} catch (error) {
			console.error("Error starting screen share:", error);
			toast.error(error.message || "Unable to share your screen");
		}
	};

	const syncCurrentCallFromDto = (call, options = {}) => {
		if (!call?.callId) return;

		updateCallState((currentState) => {
			const mergedParticipants = mergeParticipantsWithLocalState(call.participants, currentState.participants);
			const metrics = getParticipantMetrics(mergedParticipants);
			const requestedPhase = options.phase ?? currentState.phase;
			const currentUserJoinedAndActive = isCurrentUserActive(mergedParticipants, authUserRef.current?._id || "");
			const shouldMarkConnected =
				requestedPhase !== "idle" &&
				requestedPhase !== "incoming" &&
				(Boolean(call.connectedAt || currentState.connectedAt) ||
					(metrics.activeParticipantCount >= 2 && currentUserJoinedAndActive));
			const resolvedPhase = shouldMarkConnected ? "active" : requestedPhase;
			const resolvedConnectedAt = shouldMarkConnected
				? call.connectedAt || currentState.connectedAt || toIsoString()
				: call.connectedAt || currentState.connectedAt || null;
			const mergedCall = {
				...call,
				connectedAt: resolvedConnectedAt,
				participants: mergedParticipants,
				participantCount: mergedParticipants.length,
				joinedParticipantCount:
					Number.isFinite(call.joinedParticipantCount) && call.joinedParticipantCount >= metrics.joinedParticipantCount
						? call.joinedParticipantCount
						: metrics.joinedParticipantCount,
				activeParticipantCount:
					Number.isFinite(call.activeParticipantCount) && call.activeParticipantCount >= metrics.activeParticipantCount
						? call.activeParticipantCount
						: metrics.activeParticipantCount,
				invitedCount:
					Number.isFinite(call.invitedCount) && call.invitedCount >= metrics.invitedCount
						? call.invitedCount
						: metrics.invitedCount,
			};

			registerParticipants(mergedParticipants);
			return buildCallStateFromDto(mergedCall, currentState, {
				...options,
				phase: resolvedPhase,
			});
		});

		if (call.connectedAt) {
			startDurationTimer(call.connectedAt);
		}
	};

	const createPeerConnection = (targetUserId, options = {}) => {
		const existingConnection = peerConnectionsRef.current.get(targetUserId);
		if (existingConnection) {
			return existingConnection;
		}

		const { callId, mediaType = "voice" } = options;
		const connection = new RTCPeerConnection({
			iceServers: ICE_SERVERS,
			iceCandidatePoolSize: 8,
		});
		const markConnectionAsActive = () => {
			if (!callId || callStateRef.current.callId !== callId) {
				return;
			}

			const localConnectedAt = callStateRef.current.connectedAt || toIsoString();
			updateCallState((currentState) => {
				if (currentState.callId !== callId || currentState.phase === "idle" || currentState.phase === "incoming") {
					return currentState;
				}

				return {
					...currentState,
					phase: "active",
					connectedAt: currentState.connectedAt || localConnectedAt,
				};
			});
			startDurationTimer(localConnectedAt);
		};

		connection.onicecandidate = (event) => {
			if (!event.candidate || !socketRef.current || !targetUserId) return;

			socketRef.current.emit("call:ice-candidate", {
				targetUserId,
				callId,
				candidate: event.candidate,
				mediaType,
			});
		};

		connection.ontrack = (event) => {
			let [stream] = event.streams || [];

			// Some browsers can emit `ontrack` with an empty `event.streams`.
			// Build and retain a per-user MediaStream so remote audio/video is still rendered.
			if (!stream && event.track) {
				stream = inboundRemoteStreamsRef.current.get(targetUserId);
				if (!stream) {
					stream = new MediaStream();
					inboundRemoteStreamsRef.current.set(targetUserId, stream);
				}
				const hasTrack = stream.getTracks().some((track) => track.id === event.track.id);
				if (!hasTrack) {
					stream.addTrack(event.track);
				}

				event.track.onended = () => {
					const activeStream = inboundRemoteStreamsRef.current.get(targetUserId);
					if (!activeStream) return;
					activeStream.removeTrack(event.track);
					if (activeStream.getTracks().length === 0) {
						removeRemoteParticipant(targetUserId);
						return;
					}
					setRemoteParticipantStream(targetUserId, activeStream);
				};
			}

			if (stream) {
				setRemoteParticipantStream(targetUserId, stream);
			}
			markConnectionAsActive();
		};

		connection.onconnectionstatechange = () => {
			const nextState = connection.connectionState;

			if (nextState === "connected") {
				markConnectionAsActive();
				return;
			}

			if (["failed", "disconnected", "closed"].includes(nextState)) {
				closePeerConnection(targetUserId);
			}
		};

		connection.oniceconnectionstatechange = () => {
			const nextState = connection.iceConnectionState;

			if (["connected", "completed"].includes(nextState)) {
				markConnectionAsActive();
				return;
			}

			if (["failed", "disconnected", "closed"].includes(nextState)) {
				closePeerConnection(targetUserId);
			}
		};

		if (localStreamRef.current) {
			localStreamRef.current.getTracks().forEach((track) => {
				connection.addTrack(track, localStreamRef.current);
			});
		}

		peerConnectionsRef.current.set(targetUserId, connection);
		return connection;
	};

	const createOfferForTarget = async (targetUser, options = {}) => {
		const targetUserId = getUserIdKey(targetUser);
		if (!targetUserId || !socketRef.current) return;

		if (targetUser?._id) {
			registerParticipant(targetUser);
		}

		const { callId, mediaType = "voice" } = options;
		const connection = createPeerConnection(targetUserId, { callId, mediaType });
		const offer = await connection.createOffer({
			offerToReceiveAudio: true,
			offerToReceiveVideo: mediaType === "video",
		});

		await connection.setLocalDescription(offer);

		socketRef.current.emit("call:offer", {
			targetUserId,
			callId,
			offer,
			caller: authUserRef.current,
			mediaType,
		});
	};

	const offerActiveParticipantsForCall = async (call) => {
		if (!call?.callId || !localStreamRef.current || !authUserRef.current?._id) {
			return;
		}

		const activeParticipants = (call.participants || []).filter(
			(participant) =>
				participant.userId !== authUserRef.current._id && participant.joinedAt && !participant.leftAt
		);

		for (const participant of activeParticipants) {
			if (peerConnectionsRef.current.has(participant.userId)) {
				continue;
			}

			try {
				await createOfferForTarget(participant.user, {
					callId: call.callId,
					mediaType: call.mediaType,
				});
			} catch (error) {
				console.error("Error creating offer for active participant:", error);
			}
		}
	};

	const fetchCall = async (callId) => requestJson(`/api/calls/${callId}`);

	const joinCallById = async (callId, options = {}) => {
		if (!callId) return null;

		clearRecentlyClosedCall(callId);
		const call = options.call || (await fetchCall(callId));
		incomingCallRef.current = null;
		syncCurrentCallFromDto(call, {
			phase: "connecting",
			direction: options.direction || "incoming",
		});
		await prepareLocalStream(call.mediaType, {
			allowAudioFallback: call.mediaType === "video",
		});

		const joinedAt = toIsoString();
		syncParticipantLocally(authUserRef.current, {
			status: CALL_PARTICIPANT_STATUSES.JOINED,
			joinedAt,
			leftAt: null,
			isActive: true,
		});

		emitFastSocketEvent("call:participant-joined-fast", {
			targetUserIds: getOtherCallUserIds(call, { activeOnly: true }),
			callId,
			participant: authUserRef.current,
			mediaType: call.mediaType,
		});

		void requestJsonWithRetry(
			`/api/calls/${callId}/join`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			},
			{
				retries: 12,
				delayMs: 200,
				shouldRetry: (error) => /call not available|call not found/i.test(error.message || ""),
			}
		)
			.then((joinedCall) => {
				if (callStateRef.current.callId !== callId) {
					return;
				}

				syncCurrentCallFromDto(joinedCall, {
					phase: callStateRef.current.phase,
					direction: options.direction || callStateRef.current.direction || "incoming",
				});
			})
			.catch((error) => {
				console.error("Error persisting call join:", error);
				if (callStateRef.current.callId === callId) {
					emitFastSocketEvent("call:participant-left-fast", {
						targetUserIds: getOtherCallUserIds(call, { activeOnly: true }),
						callId,
						participantUserId: authUserRef.current?._id,
					});
					resetCallLocally();
					toast.error(error.message || "Unable to join the call");
				}
			});

		return call;
	};

	const startCall = async (target, mediaType = "voice") => {
		if (!authUserRef.current?._id || !socketRef.current?.connected || !isSocketConnected) {
			toast.error("Call connection is still loading");
			return;
		}

		if (!target?._id || callStateRef.current.phase !== "idle") {
			toast.error("Finish the current call first");
			return;
		}

		let startedCall = null;
		const localCallId = createClientCallId();
		clearRecentlyClosedCall(localCallId);
		const optimisticCall = buildOptimisticCall({
			target,
			mediaType,
			callId: localCallId,
		});
		const fastRingTargetUserIds = getOtherCallUserIds(optimisticCall);

		try {
			syncCurrentCallFromDto(optimisticCall, {
				phase: "dialing",
				direction: "outgoing",
			});
			emitFastSocketEvent("call:ringing-fast", {
				targetUserIds: fastRingTargetUserIds,
				call: optimisticCall,
			});

			const payload =
				target.type === "GROUP"
					? { conversationId: target._id, mediaType, callId: localCallId }
					: { targetUserId: target._id, conversationId: target.conversationId || null, mediaType, callId: localCallId };
			const localStreamPromise = prepareLocalStream(mediaType);
			const startedCallPromise = requestJson("/api/calls/start", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});
			startedCall = await startedCallPromise;

			if (callStateRef.current.callId === localCallId) {
				syncCurrentCallFromDto(startedCall, {
					phase: callStateRef.current.phase || "dialing",
					direction: "outgoing",
				});
			}

			await localStreamPromise;
			await offerActiveParticipantsForCall(callStateRef.current.callId ? callStateRef.current : optimisticCall);
		} catch (error) {
			console.error(`Error starting ${mediaType} call:`, error);
			markCallAsRecentlyClosed(localCallId, 180000, buildClosedCallSnapshot(optimisticCall));
			emitFastSocketEvent("call:ended-fast", {
				targetUserIds: fastRingTargetUserIds,
				callId: localCallId,
				endedByUserId: authUserRef.current?._id,
				reason: "cancelled",
			});
			if (startedCall?.callId) {
				try {
					await requestJson(`/api/calls/${startedCall.callId}/end`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
					});
				} catch {
					// Ignore cleanup failure here; local reset still prevents the UI from hanging.
				}
			}
			resetCallLocally();
			toast.error(error.message || `Unable to start the ${mediaType} call`);
		}
	};

	const startVoiceCall = async (target) => {
		await startCall(target, "voice");
	};

	const startVideoCall = async (target) => {
		await startCall(target, "video");
	};

	const acceptIncomingCall = async () => {
		const incomingCall = incomingCallRef.current;
		if (!incomingCall?.callId) return;

		try {
			await joinCallById(incomingCall.callId, {
				call: incomingCall,
				direction: "incoming",
			});
		} catch (error) {
			console.error("Error accepting call:", error);
			toast.error(error.message || "Unable to join the call");
			resetCallLocally();
		}
	};

	const joinExistingCall = async (call) => {
		if (callStateRef.current.phase !== "idle") {
			toast.error("Finish the current call first");
			return;
		}

		try {
			await joinCallById(call.callId || call._id, {
				call,
				direction: "incoming",
			});
		} catch (error) {
			console.error("Error joining existing call:", error);
			resetCallLocally();
			toast.error(error.message || "Unable to join the call");
		}
	};

	const declineIncomingCall = async () => {
		const incomingCall = incomingCallRef.current || callStateRef.current;
		if (!incomingCall?.callId) {
			resetCallLocally();
			return;
		}

		markCallAsRecentlyClosed(incomingCall.callId, 180000, buildClosedCallSnapshot(incomingCall));
		emitFastSocketEvent("call:declined-fast", {
			targetUserIds: getOtherCallUserIds(incomingCall, { activeOnly: true }),
			callId: incomingCall.callId,
			userId: authUserRef.current?._id,
		});
		resetCallLocally();

		void requestJsonWithRetry(
			`/api/calls/${incomingCall.callId}/decline`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			},
			{
				retries: 12,
				delayMs: 200,
				shouldRetry: (error) => /call not available|call not found/i.test(error.message || ""),
			}
		).catch((error) => {
			toast.error(error.message || "Unable to decline the call");
		});
	};

	const endCurrentCall = async () => {
		const activeCall = callStateRef.current;
		if (!activeCall.callId) {
			resetCallLocally();
			return;
		}

		try {
			const currentUserId = authUserRef.current?._id || "";
			const shouldLeaveOnly =
				(activeCall.callMode === "group" || activeCall.activeParticipantCount > 2) &&
				activeCall.initiatorId !== currentUserId;
			const endpoint = shouldLeaveOnly ? "leave" : "end";
			const targetUserIds = getOtherCallUserIds(activeCall);

			if (shouldLeaveOnly) {
				markCallAsRecentlyClosed(activeCall.callId, 8000);
				emitFastSocketEvent("call:participant-left-fast", {
					targetUserIds,
					callId: activeCall.callId,
					participantUserId: currentUserId,
				});
			} else {
				markCallAsRecentlyClosed(activeCall.callId, 180000, buildClosedCallSnapshot(activeCall));
				emitFastSocketEvent("call:ended-fast", {
					targetUserIds,
					callId: activeCall.callId,
					endedByUserId: currentUserId,
				});
			}

			resetCallLocally();
			await requestJsonWithRetry(
				`/api/calls/${activeCall.callId}/${endpoint}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
				},
				{
					retries: 12,
					delayMs: 200,
					shouldRetry: (error) => /call not available|call not found/i.test(error.message || ""),
				}
			);
		} catch (error) {
			toast.error(error.message || "Unable to finish the call");
		}
	};

	const inviteUsersToCurrentCall = async (userIds) => {
		const activeCall = callStateRef.current;
		if (!activeCall.callId) {
			toast.error("No active call");
			return null;
		}

		const normalizedUserIds = [...new Set((userIds || []).filter(Boolean))];
		if (normalizedUserIds.length === 0) {
			return null;
		}

		const updatedCall = await requestJson(`/api/calls/${activeCall.callId}/invite`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ userIds: normalizedUserIds }),
		});

		syncCurrentCallFromDto(updatedCall, {
			phase: callStateRef.current.phase,
			direction: callStateRef.current.direction,
		});
		return updatedCall;
	};

	const toggleMute = () => {
		const stream = localStreamRef.current;
		if (!stream) return;

		const nextMutedState = !callStateRef.current.isMuted;
		stream.getAudioTracks().forEach((track) => {
			track.enabled = !nextMutedState;
		});

		updateCallState((currentState) => ({
			...currentState,
			isMuted: nextMutedState,
		}));
	};

	useEffect(() => {
		if (!socket || !authUser?._id) return undefined;

		const handleCallRinging = ({ call } = {}) => {
			if (!call?.callId) return;
			const normalizedCall = normalizeIncomingCallForViewer(call);
			if (isCallRecentlyClosed(call.callId)) return;
			if (normalizedCall?.status && normalizedCall.status !== CALL_STATUSES.RINGING) return;

			if (incomingCallRef.current?.callId === call.callId) {
				incomingCallRef.current = {
					...incomingCallRef.current,
					...normalizedCall,
				};
			}

			if (callStateRef.current.callId === call.callId) {
				syncCurrentCallFromDto(normalizedCall, {
					phase: callStateRef.current.phase,
					direction: callStateRef.current.direction || "incoming",
				});
				return;
			}

			if (callStateRef.current.phase !== "idle") {
				toast("Incoming call available in Calls");
				return;
			}

			incomingCallRef.current = normalizedCall;
			registerParticipants(normalizedCall.participants);
			updateCallState(buildCallStateFromDto(normalizedCall, INITIAL_CALL_STATE, {
				phase: "incoming",
				direction: "incoming",
			}));
		};

		const handleCallParticipants = ({ call } = {}) => {
			if (!call?.callId) return;
			const normalizedCall = normalizeIncomingCallForViewer(call);
			if (isCallRecentlyClosed(call.callId) && callStateRef.current.callId !== call.callId) {
				return;
			}
			if (normalizedCall.status === CALL_STATUSES.ENDED) {
				markCallAsRecentlyClosed(call.callId, 180000, buildClosedCallSnapshot(normalizedCall));
			}

			if (incomingCallRef.current?.callId === call.callId) {
				incomingCallRef.current = normalizedCall;
			}

			if (callStateRef.current.callId !== call.callId) {
				return;
			}
			if (normalizedCall.status === CALL_STATUSES.ENDED) {
				toast("Call ended");
				resetCallLocally();
				return;
			}

			syncCurrentCallFromDto(normalizedCall, {
				phase: callStateRef.current.phase,
				direction: callStateRef.current.direction,
			});
		};

		const handleParticipantJoined = async ({ callId, participant, mediaType = "voice" } = {}) => {
			if (!callId || callStateRef.current.callId !== callId || !participant?._id || participant._id === authUser._id) {
				return;
			}

			registerParticipant(participant);
			syncParticipantLocally(participant, {
				status: CALL_PARTICIPANT_STATUSES.JOINED,
				joinedAt: toIsoString(),
				leftAt: null,
				isActive: true,
			});
			if (!localStreamRef.current || peerConnectionsRef.current.has(participant._id)) {
				return;
			}

			try {
				await createOfferForTarget(participant, {
					callId,
					mediaType,
				});
			} catch (error) {
				console.error("Error creating call offer:", error);
			}
		};

		const handleParticipantLeft = ({ callId, participantUserId } = {}) => {
			if (!callId || callStateRef.current.callId !== callId || !participantUserId) return;
			const currentCall = callStateRef.current;
			const remainingActiveCount = (currentCall.participants || []).filter(
				(participant) =>
					participant.userId !== participantUserId && participant.joinedAt && !participant.leftAt
			).length;

			syncParticipantLocally(participantUserId, {
				status: CALL_PARTICIPANT_STATUSES.JOINED,
				leftAt: toIsoString(),
				isActive: false,
			});
			closePeerConnection(participantUserId);

			if (remainingActiveCount <= 1 && currentCall.phase !== "incoming") {
				const closedSnapshot = buildClosedCallSnapshot(currentCall);
				markCallAsRecentlyClosed(callId, 180000, closedSnapshot);
				emitFastSocketEvent("call:ended-fast", {
					targetUserIds: getOtherCallUserIds(currentCall),
					callId,
					endedByUserId: authUserRef.current?._id,
					reason: "insufficient-participants",
				});
				resetCallLocally();

				void requestJsonWithRetry(
					`/api/calls/${callId}/end`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
					},
					{
						retries: 8,
						delayMs: 200,
						shouldRetry: (error) => /call not available|call not found/i.test(error.message || ""),
					}
				).catch(() => {
					// Ignore persistence latency here. UI already reflects the ended call instantly.
				});
			}
		};

		const handleParticipantDeclined = ({ callId, userId } = {}) => {
			if (!callId || callStateRef.current.callId !== callId || !userId || userId === authUser._id) return;
			syncParticipantLocally(userId, {
				status: CALL_PARTICIPANT_STATUSES.DECLINED,
				leftAt: toIsoString(),
				isActive: false,
			});
			const declinedUser =
				callStateRef.current.participants.find((participant) => participant.userId === userId)?.user ||
				participantDirectoryRef.current.get(userId);
			toast.error(`${declinedUser?.fullName || "A participant"} declined the call`);
		};

		const handleOffer = async ({ offer, caller, callerId, callId, mediaType = "voice" } = {}) => {
			if (!offer || !callerId || callStateRef.current.callId !== callId) {
				return;
			}

			try {
				if (!localStreamRef.current) {
					// Wait briefly for `getUserMedia` to settle before dropping the offer.
					for (let attempt = 0; attempt < 18 && !localStreamRef.current; attempt += 1) {
						if (callStateRef.current.callId !== callId) {
							return;
						}
						// eslint-disable-next-line no-await-in-loop
						await wait(80);
					}
				}

				if (!localStreamRef.current || callStateRef.current.callId !== callId) {
					return;
				}

				registerParticipant(caller);
				const connection = createPeerConnection(callerId, {
					callId,
					mediaType,
				});
				await connection.setRemoteDescription(new RTCSessionDescription(offer));
				await flushPendingIceCandidates(callerId);
				const answer = await connection.createAnswer();
				await connection.setLocalDescription(answer);

				socketRef.current?.emit("call:answer", {
					targetUserId: callerId,
					callId,
					answer,
					responder: authUserRef.current,
					mediaType,
				});

				updateCallState((currentState) => ({
					...currentState,
					phase: currentState.phase === "active" ? "active" : "connecting",
				}));
			} catch (error) {
				console.error("Error handling call offer:", error);
			}
		};

		const handleAnswer = async ({ answer, responder, responderId, callId } = {}) => {
			const targetUserId = responderId || responder?._id;
			if (!answer || !targetUserId || callStateRef.current.callId !== callId) return;

			try {
				registerParticipant(responder);
				const connection = peerConnectionsRef.current.get(targetUserId);
				if (!connection) return;

				await connection.setRemoteDescription(new RTCSessionDescription(answer));
				await flushPendingIceCandidates(targetUserId);
				updateCallState((currentState) => ({
					...currentState,
					phase: currentState.phase === "active" ? "active" : "connecting",
				}));
			} catch (error) {
				console.error("Error handling call answer:", error);
			}
		};

		const handleCandidate = async ({ candidate, fromUserId, callId } = {}) => {
			if (!candidate || !fromUserId || callStateRef.current.callId !== callId) return;

			const connection = peerConnectionsRef.current.get(fromUserId);
			if (!connection || !connection.remoteDescription) {
				queueIceCandidate(fromUserId, candidate);
				return;
			}

			try {
				await connection.addIceCandidate(new RTCIceCandidate(candidate));
			} catch (error) {
				console.error("Error adding ICE candidate:", error);
			}
		};

		const handleCallEnded = ({ callId } = {}) => {
			if (!callId) return;
			const isCurrentCall = callStateRef.current.callId === callId;
			markCallAsRecentlyClosed(
				callId,
				180000,
				isCurrentCall ? buildClosedCallSnapshot(callStateRef.current) : null
			);
			if (!isCurrentCall) return;
			toast("Call ended");
			resetCallLocally();
		};

		socket.on("call:ringing", handleCallRinging);
		socket.on("call:participants", handleCallParticipants);
		socket.on("call:participant-joined", handleParticipantJoined);
		socket.on("call:participant-left", handleParticipantLeft);
		socket.on("call:participant-declined", handleParticipantDeclined);
		socket.on("call:offer", handleOffer);
		socket.on("call:answer", handleAnswer);
		socket.on("call:ice-candidate", handleCandidate);
		socket.on("call:end", handleCallEnded);
		socket.on("call:ended", handleCallEnded);

		return () => {
			socket.off("call:ringing", handleCallRinging);
			socket.off("call:participants", handleCallParticipants);
			socket.off("call:participant-joined", handleParticipantJoined);
			socket.off("call:participant-left", handleParticipantLeft);
			socket.off("call:participant-declined", handleParticipantDeclined);
			socket.off("call:offer", handleOffer);
			socket.off("call:answer", handleAnswer);
			socket.off("call:ice-candidate", handleCandidate);
			socket.off("call:end", handleCallEnded);
			socket.off("call:ended", handleCallEnded);
		};
	}, [authUser?._id, socket, isSocketConnected]);

	useEffect(() => {
		if (!authUser?._id || !socket || !isSocketConnected) {
			resetCallLocally();
		}
	}, [authUser?._id, isSocketConnected, socket]);

	useEffect(() => {
		return () => {
			resetCallLocally();
		};
	}, []);

	const joinedParticipants = callState.participants
		.filter((participant) => participant.joinedAt)
		.map((participant) => participant.user)
		.filter(Boolean);
	const isCallClosedForUi = (callId) => isCallRecentlyClosed(callId);
	const getClosedCallInfo = (callInfoOrId) => {
		const callId = typeof callInfoOrId === "string" ? callInfoOrId : callInfoOrId?.callId;
		const closedSnapshot = getClosedCallSnapshot(callId);
		if (!closedSnapshot) return null;

		if (typeof callInfoOrId === "object" && callInfoOrId) {
			return {
				...callInfoOrId,
				...closedSnapshot,
				status: CALL_STATUSES.ENDED,
				activeParticipantCount: 0,
				canJoin: false,
			};
		}

		return closedSnapshot;
	};

	const value = {
		callState,
		localStream,
		remoteStream: remoteParticipants[0]?.stream || null,
		remoteParticipants,
		groupParticipants: uniqueUsers(joinedParticipants),
		callDurationSeconds,
		isCallReady: Boolean(authUser?._id && socket?.connected && isSocketConnected),
		startVoiceCall,
		startVideoCall,
		acceptIncomingCall,
		declineIncomingCall,
		endCurrentCall,
		joinExistingCall,
		inviteUsersToCurrentCall,
		toggleMute,
		toggleScreenShare,
		isCallClosedForUi,
		getClosedCallInfo,
	};

	return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
