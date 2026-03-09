import { createContext, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "./AuthContext";
import { useSocketContext } from "./SocketContext";

const STUN_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
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
	connectedAt: call.connectedAt || null,
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
	const durationIntervalRef = useRef(null);
	const incomingCallRef = useRef(null);

	useEffect(() => {
		callStateRef.current = callState;
	}, [callState]);

	useEffect(() => {
		socketRef.current = socket;
	}, [socket]);

	useEffect(() => {
		authUserRef.current = authUser;
	}, [authUser]);

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

			return {
				...currentState,
				status: metrics.activeParticipantCount > 1 ? CALL_STATUSES.ACTIVE : currentState.status,
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
			const participantIndex = currentParticipants.findIndex((participant) => participant.user?._id === userId);
			if (participantIndex === -1) {
				return [...currentParticipants, { user, stream }];
			}

			const nextParticipants = [...currentParticipants];
			nextParticipants[participantIndex] = {
				user: user || nextParticipants[participantIndex].user,
				stream,
			};
			return nextParticipants;
		});
	};

	const removeRemoteParticipant = (userId) => {
		setRemoteParticipants((currentParticipants) =>
			currentParticipants.filter((participant) => participant.user?._id !== userId)
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
			const mergedCall = {
				...call,
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
				phase: options.phase ?? currentState.phase,
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
		const connection = new RTCPeerConnection({ iceServers: STUN_SERVERS });

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
			const [stream] = event.streams;
			if (stream) {
				setRemoteParticipantStream(targetUserId, stream);
			}
		};

		connection.onconnectionstatechange = () => {
			const nextState = connection.connectionState;

			if (nextState === "connected") {
				updateCallState((currentState) => ({
					...currentState,
					phase: "active",
				}));

				if (callStateRef.current.connectedAt) {
					startDurationTimer(callStateRef.current.connectedAt);
				}
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
				emitFastSocketEvent("call:participant-left-fast", {
					targetUserIds,
					callId: activeCall.callId,
					participantUserId: currentUserId,
				});
			} else {
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

			if (incomingCallRef.current?.callId === call.callId) {
				incomingCallRef.current = {
					...incomingCallRef.current,
					...call,
				};
			}

			if (callStateRef.current.callId === call.callId) {
				syncCurrentCallFromDto(call, {
					phase: callStateRef.current.phase,
					direction: callStateRef.current.direction || "incoming",
				});
				return;
			}

			if (callStateRef.current.phase !== "idle") {
				toast("Incoming call available in Calls");
				return;
			}

			incomingCallRef.current = call;
			registerParticipants(call.participants);
			updateCallState(buildCallStateFromDto(call, INITIAL_CALL_STATE, {
				phase: "incoming",
				direction: "incoming",
			}));
		};

		const handleCallParticipants = ({ call } = {}) => {
			if (!call?.callId) return;

			if (incomingCallRef.current?.callId === call.callId) {
				incomingCallRef.current = call;
			}

			if (callStateRef.current.callId !== call.callId) {
				return;
			}

			syncCurrentCallFromDto(call, {
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
			syncParticipantLocally(participantUserId, {
				status: CALL_PARTICIPANT_STATUSES.JOINED,
				leftAt: toIsoString(),
				isActive: false,
			});
			closePeerConnection(participantUserId);
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
			if (!offer || !callerId || callStateRef.current.callId !== callId || !localStreamRef.current) {
				return;
			}

			try {
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
					phase: "connecting",
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
			if (!callId || callStateRef.current.callId !== callId) return;
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
	};

	return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
};
