import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	HiMiniPhone,
	HiMiniPhoneXMark,
	HiMiniUserGroup,
	HiMiniVideoCamera,
	HiOutlineUserPlus,
} from "react-icons/hi2";
import { IoChevronDown, IoChevronUp, IoContractOutline, IoExpandOutline, IoMicOffOutline, IoMicOutline } from "react-icons/io5";
import { MdOutlineScreenShare, MdStopScreenShare } from "react-icons/md";
import { useCallContext } from "../../context/CallContext";
import callRingtone from "../../assets/sounds/call-ringtone.wav";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import VerifiedBadge from "../common/VerifiedBadge";
import DeveloperBadge from "../common/DeveloperBadge";

const formatDuration = (totalSeconds) => {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const getFullscreenElement = () => {
	if (typeof document === "undefined") return null;
	return document.fullscreenElement || document.webkitFullscreenElement || null;
};

const canUseFullscreen = () => {
	if (typeof document === "undefined") return false;
	return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
};

const requestFullscreen = async (element) => {
	if (!element) return;
	if (typeof element.requestFullscreen === "function") {
		await element.requestFullscreen();
		return;
	}
	if (typeof element.webkitRequestFullscreen === "function") {
		element.webkitRequestFullscreen();
	}
};

const exitFullscreen = async () => {
	if (typeof document === "undefined") return;
	if (!getFullscreenElement()) return;

	try {
		if (typeof document.exitFullscreen === "function") {
			await document.exitFullscreen();
			return;
		}
		if (typeof document.webkitExitFullscreen === "function") {
			document.webkitExitFullscreen();
		}
	} catch {
		// Ignore "Document not active" and similar browser-specific fullscreen errors.
	}
};

const StreamVideo = ({ stream, className = "", muted = false, mirrored = false }) => {
	const videoRef = useRef(null);

	useEffect(() => {
		const videoElement = videoRef.current;
		if (!videoElement) return;
		videoElement.srcObject = stream || null;

		const attemptPlay = () => {
			void videoElement.play().catch(() => {});
		};

		if (stream) {
			attemptPlay();
			videoElement.addEventListener("loadedmetadata", attemptPlay);
			videoElement.addEventListener("canplay", attemptPlay);
		}

		return () => {
			videoElement.removeEventListener("loadedmetadata", attemptPlay);
			videoElement.removeEventListener("canplay", attemptPlay);
		};
	}, [stream]);

	return (
		<video
			ref={videoRef}
			autoPlay
			playsInline
			muted={muted}
			className={`${className} ${mirrored ? "scale-x-[-1]" : ""}`.trim()}
		/>
	);
};

const StreamAudio = ({ stream }) => {
	const audioRef = useRef(null);

	useEffect(() => {
		const audioElement = audioRef.current;
		if (!audioElement) return;
		audioElement.srcObject = stream || null;
		audioElement.muted = false;
		audioElement.volume = 1;

		const attemptPlay = () => {
			void audioElement.play().catch(() => {});
		};

		if (stream) {
			attemptPlay();
			audioElement.addEventListener("loadedmetadata", attemptPlay);
			audioElement.addEventListener("canplay", attemptPlay);
			window.addEventListener("pointerdown", attemptPlay, { once: true });
		}

		return () => {
			audioElement.removeEventListener("loadedmetadata", attemptPlay);
			audioElement.removeEventListener("canplay", attemptPlay);
		};
	}, [stream]);

	return <audio ref={audioRef} autoPlay playsInline />;
};

const resolveAvatar = (entity, size = 144) =>
	getAvatarUrl(entity?.profilePic, size) ||
	getConversationFallbackAvatar({
		fullName: entity?.fullName || entity?.title || "Call",
		profilePic: entity?.profilePic,
		gender: entity?.gender,
	});

const FLOAT_WIDGET_MARGIN = 12;

const getViewportBounds = () => {
	if (typeof window === "undefined") {
		return { width: 0, height: 0 };
	}

	return {
		width: window.visualViewport?.width || window.innerWidth,
		height: window.visualViewport?.height || window.innerHeight,
	};
};

const clampFloatingPosition = (x, y, widgetWidth, widgetHeight) => {
	const { width: viewportWidth, height: viewportHeight } = getViewportBounds();
	const maxX = Math.max(FLOAT_WIDGET_MARGIN, viewportWidth - widgetWidth - FLOAT_WIDGET_MARGIN);
	const maxY = Math.max(FLOAT_WIDGET_MARGIN, viewportHeight - widgetHeight - FLOAT_WIDGET_MARGIN);

	return {
		x: Math.min(Math.max(x, FLOAT_WIDGET_MARGIN), maxX),
		y: Math.min(Math.max(y, FLOAT_WIDGET_MARGIN), maxY),
	};
};

const getDefaultFloatingPosition = (widgetWidth, widgetHeight) => {
	const { width: viewportWidth, height: viewportHeight } = getViewportBounds();

	return clampFloatingPosition(
		viewportWidth - widgetWidth - FLOAT_WIDGET_MARGIN,
		viewportHeight - widgetHeight - FLOAT_WIDGET_MARGIN,
		widgetWidth,
		widgetHeight
	);
};

const VoiceCallOverlay = () => {
	const {
		callState,
		localStream,
		remoteParticipants,
		groupParticipants,
		callDurationSeconds,
		acceptIncomingCall,
		declineIncomingCall,
		endCurrentCall,
		inviteUsersToCurrentCall,
		toggleScreenShare,
		toggleMute,
		switchCallMediaType,
		isSwitchingMedia,
	} = useCallContext();
	const ringtoneAudioRef = useRef(null);
	const videoStageRef = useRef(null);
	const floatingContainerRef = useRef(null);
	const floatingDragRef = useRef(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isLocalVideoPrimary, setIsLocalVideoPrimary] = useState(false);
	const [isMinimized, setIsMinimized] = useState(false);
	const [minimizedMode, setMinimizedMode] = useState("card");
	const [floatingPosition, setFloatingPosition] = useState(null);
	const [isDraggingFloating, setIsDraggingFloating] = useState(false);
	const [showInviteModal, setShowInviteModal] = useState(false);
	const [inviteCandidates, setInviteCandidates] = useState([]);
	const [loadingInviteCandidates, setLoadingInviteCandidates] = useState(false);
	const [selectedInviteeIds, setSelectedInviteeIds] = useState([]);
	const [isInviting, setIsInviting] = useState(false);

	useEffect(() => {
		const ringtoneAudio = ringtoneAudioRef.current;
		if (!ringtoneAudio) return;

		if (callState.phase === "incoming") {
			ringtoneAudio.currentTime = 0;
			ringtoneAudio.volume = 0.72;
			void ringtoneAudio.play().catch(() => {});

			if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
				navigator.vibrate([260, 140, 260, 140, 380]);
			}

			return () => {
				ringtoneAudio.pause();
				ringtoneAudio.currentTime = 0;
				if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
					navigator.vibrate(0);
				}
			};
		}

		ringtoneAudio.pause();
		ringtoneAudio.currentTime = 0;
		if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
			navigator.vibrate(0);
		}
	}, [callState.phase]);

	useEffect(() => {
		if (typeof document === "undefined") return undefined;

		const syncFullscreenState = () => {
			setIsFullscreen(getFullscreenElement() === videoStageRef.current);
		};

		document.addEventListener("fullscreenchange", syncFullscreenState);
		document.addEventListener("webkitfullscreenchange", syncFullscreenState);

		return () => {
			document.removeEventListener("fullscreenchange", syncFullscreenState);
			document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (getFullscreenElement() === videoStageRef.current) {
				void exitFullscreen();
			}
		};
	}, []);

	useEffect(() => {
		setIsLocalVideoPrimary(false);
		setIsMinimized(false);
		setMinimizedMode("card");
		setFloatingPosition(null);
		setIsDraggingFloating(false);
	}, [callState.callId]);

	useEffect(() => {
		if (callState.phase === "incoming") {
			setIsMinimized(false);
			setMinimizedMode("card");
		}
	}, [callState.phase]);

	useEffect(() => {
		return () => {
			const activeDrag = floatingDragRef.current;
			if (!activeDrag) return;
			window.removeEventListener("pointermove", activeDrag.onPointerMove);
			window.removeEventListener("pointerup", activeDrag.onPointerUp);
			window.removeEventListener("pointercancel", activeDrag.onPointerUp);
		};
	}, []);

	useEffect(() => {
		if (!showInviteModal || !callState.callId) return;

		let isCancelled = false;
		const loadInviteCandidates = async () => {
			setLoadingInviteCandidates(true);
			try {
				const response = await fetch("/api/users/selectable?scope=contacts");
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Failed to load users");
				}

				if (isCancelled) return;

				const blockedUserIds = new Set((callState.participants || []).map((participant) => participant.userId));
				setInviteCandidates(
					(Array.isArray(data) ? data : []).filter((user) => !blockedUserIds.has(user._id))
				);
			} catch (error) {
				if (!isCancelled) {
					setInviteCandidates([]);
				}
			} finally {
				if (!isCancelled) {
					setLoadingInviteCandidates(false);
				}
			}
		};

		void loadInviteCandidates();

		return () => {
			isCancelled = true;
		};
	}, [showInviteModal, callState.callId, callState.participants]);

	useEffect(() => {
		if (!showInviteModal) {
			setSelectedInviteeIds([]);
		}
	}, [showInviteModal]);

	const isGroupCall = callState.callMode === "group" || callState.participants.length > 2;
	const isVideoCall = callState.mediaType === "video";
	const supportsFullscreen = isVideoCall && canUseFullscreen();
	const primaryUser = callState.otherUser;
	const shouldShowOverlay =
		callState.phase !== "idle" && (isGroupCall ? Boolean(callState.conversationId) : Boolean(primaryUser?._id));

	const localHasVideo = Boolean(localStream?.getVideoTracks?.().length);
	const remoteCount = remoteParticipants.length;
	const participantCount = isGroupCall ? groupParticipants.length : primaryUser?._id ? 2 : 1;
	const primaryRemoteParticipant = remoteParticipants[0] || null;
	const remoteHasVideo = Boolean(primaryRemoteParticipant?.stream?.getVideoTracks?.().length);

	const conversationSummary = useMemo(
		() => ({
			fullName: callState.conversationTitle || "Group call",
			profilePic: callState.conversationProfilePic || "",
		}),
		[callState.conversationProfilePic, callState.conversationTitle]
	);

	const statusLabel =
		callState.phase === "incoming"
			? isGroupCall
				? isVideoCall
					? "Incoming group video call"
					: "Incoming group voice call"
				: isVideoCall
					? "Incoming video call"
					: "Incoming voice call"
			: callState.phase === "dialing"
				? isGroupCall
					? `Ringing ${Math.max(participantCount - 1, 0)} member${participantCount - 1 === 1 ? "" : "s"}...`
					: isVideoCall
						? "Starting video call..."
						: "Calling..."
				: callState.phase === "connecting"
					? isGroupCall
						? "Joining group call..."
						: isVideoCall
							? "Connecting video..."
							: "Connecting..."
					: formatDuration(callDurationSeconds);

	const title = isGroupCall ? conversationSummary.fullName : primaryUser?.fullName || "Call";
	const subtitle = isGroupCall
		? primaryUser?._id
			? `${primaryUser.fullName} is calling this group`
			: `${participantCount} participants`
		: primaryUser?.username
			? `@${primaryUser.username}`
			: "";
	const isScreenSharing = Boolean(callState.isScreenSharing);
	const canMinimizeCall = callState.phase !== "incoming";

	const leadAvatar = isGroupCall ? resolveAvatar(conversationSummary) : resolveAvatar(primaryUser);
	const switchMediaLabel = isVideoCall ? "Switch to voice call" : "Switch to video call";
	const hasFloatingPosition = Number.isFinite(floatingPosition?.x) && Number.isFinite(floatingPosition?.y);
	const floatingWidgetStyle = hasFloatingPosition
		? { left: `${floatingPosition.x}px`, top: `${floatingPosition.y}px` }
		: { left: "0px", top: "0px" };

	const clearFloatingDrag = () => {
		const activeDrag = floatingDragRef.current;
		if (!activeDrag) return;

		window.removeEventListener("pointermove", activeDrag.onPointerMove);
		window.removeEventListener("pointerup", activeDrag.onPointerUp);
		window.removeEventListener("pointercancel", activeDrag.onPointerUp);
		floatingDragRef.current = null;
		setIsDraggingFloating(false);
	};

	const isFloatingDragExcludedTarget = (target) => {
		if (!(target instanceof Element)) return false;
		return Boolean(target.closest("button, a, input, textarea, select, [role='button'], [data-floating-no-drag='true']"));
	};

	const startFloatingDrag = (event, options = {}) => {
		if (!canMinimizeCall) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;
		if (options.ignoreInteractiveTargets && isFloatingDragExcludedTarget(event.target)) return;

		const container = floatingContainerRef.current;
		if (!container) return;

		event.preventDefault();
		clearFloatingDrag();

		const rect = container.getBoundingClientRect();
		const dragMeta = {
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			offsetX: event.clientX - rect.left,
			offsetY: event.clientY - rect.top,
			moved: false,
			onTap: typeof options.onTap === "function" ? options.onTap : null,
			onPointerMove: null,
			onPointerUp: null,
		};

		const onPointerMove = (moveEvent) => {
			if (moveEvent.pointerId !== dragMeta.pointerId) return;

			const currentContainer = floatingContainerRef.current;
			if (!currentContainer) return;
			const currentRect = currentContainer.getBoundingClientRect();
			const distance = Math.hypot(
				moveEvent.clientX - dragMeta.startClientX,
				moveEvent.clientY - dragMeta.startClientY
			);
			if (distance > 4) {
				dragMeta.moved = true;
			}

			setFloatingPosition(
				clampFloatingPosition(
					moveEvent.clientX - dragMeta.offsetX,
					moveEvent.clientY - dragMeta.offsetY,
					currentRect.width,
					currentRect.height
				)
			);
		};

		const onPointerUp = (upEvent) => {
			if (upEvent.pointerId !== dragMeta.pointerId) return;

			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
			floatingDragRef.current = null;
			setIsDraggingFloating(false);

			if (!dragMeta.moved) {
				dragMeta.onTap?.();
			}
		};

		dragMeta.onPointerMove = onPointerMove;
		dragMeta.onPointerUp = onPointerUp;
		floatingDragRef.current = dragMeta;
		setIsDraggingFloating(true);

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
	};

	useEffect(() => {
		if (!isMinimized || !canMinimizeCall) {
			clearFloatingDrag();
			return undefined;
		}

		const syncFloatingPosition = () => {
			const container = floatingContainerRef.current;
			if (!container) return;
			const rect = container.getBoundingClientRect();

			setFloatingPosition((currentValue) => {
				if (!currentValue || !Number.isFinite(currentValue.x) || !Number.isFinite(currentValue.y)) {
					return getDefaultFloatingPosition(rect.width, rect.height);
				}

				return clampFloatingPosition(currentValue.x, currentValue.y, rect.width, rect.height);
			});
		};

		const rafId = window.requestAnimationFrame(syncFloatingPosition);
		window.addEventListener("resize", syncFloatingPosition);
		window.addEventListener("orientationchange", syncFloatingPosition);
		window.visualViewport?.addEventListener("resize", syncFloatingPosition);
		window.visualViewport?.addEventListener("scroll", syncFloatingPosition);

		return () => {
			window.cancelAnimationFrame(rafId);
			window.removeEventListener("resize", syncFloatingPosition);
			window.removeEventListener("orientationchange", syncFloatingPosition);
			window.visualViewport?.removeEventListener("resize", syncFloatingPosition);
			window.visualViewport?.removeEventListener("scroll", syncFloatingPosition);
		};
	}, [isMinimized, canMinimizeCall, minimizedMode]);

	if (!shouldShowOverlay) return null;

	const toggleInvitee = (userId) => {
		setSelectedInviteeIds((currentIds) =>
			currentIds.includes(userId)
				? currentIds.filter((currentId) => currentId !== userId)
				: [...currentIds, userId]
		);
	};

	const handleInviteParticipants = async () => {
		if (selectedInviteeIds.length === 0 || isInviting) return;

		setIsInviting(true);
		try {
			await inviteUsersToCurrentCall(selectedInviteeIds);
			setShowInviteModal(false);
		} catch (error) {
			console.error("Error inviting users to call:", error);
		} finally {
			setIsInviting(false);
		}
	};

	const handleSwitchMediaType = async () => {
		if (callState.phase === "incoming" || isSwitchingMedia) return;
		await switchCallMediaType(isVideoCall ? "voice" : "video");
	};

	const handleToggleMinimized = () => {
		if (!canMinimizeCall) return;
		if (showInviteModal) {
			setShowInviteModal(false);
		}
		setIsMinimized((currentValue) => !currentValue);
	};

	const handleShowAvatarOnly = () => {
		if (!canMinimizeCall) return;
		setMinimizedMode("avatar");
	};

	const handleShowMiniCard = () => {
		setMinimizedMode("card");
	};

	const toggleFullscreen = async () => {
		if (!supportsFullscreen || !videoStageRef.current) return;
		if (getFullscreenElement() === videoStageRef.current) {
			await exitFullscreen();
			return;
		}
		await requestFullscreen(videoStageRef.current);
	};

	const canSwapDirectVideo = isVideoCall && !isGroupCall && localHasVideo;
	const isShowingLocalInMain = canSwapDirectVideo && isLocalVideoPrimary;
	const mainDirectStream = isShowingLocalInMain ? localStream : primaryRemoteParticipant?.stream || null;
	const shouldShowMainDirectVideo =
		Boolean(mainDirectStream) &&
		(isShowingLocalInMain ? localHasVideo : remoteHasVideo || Boolean(primaryRemoteParticipant?.stream));

	const togglePrimaryVideo = () => {
		if (!canSwapDirectVideo) return;
		setIsLocalVideoPrimary((currentValue) => !currentValue);
	};

	const renderParticipantBadges = () =>
		groupParticipants.slice(0, 8).map((participant) => (
			<div
				key={participant._id}
				className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200'
			>
				<img
					src={resolveAvatar(participant, 64)}
					alt={participant.fullName}
					className='h-6 w-6 rounded-full object-cover'
				/>
				<span className='max-w-[8rem] truncate'>{participant.fullName}</span>
			</div>
		));

	const renderGroupVideoTiles = () => {
		if (remoteParticipants.length === 0) {
			return (
				<div className='flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_46%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(15,23,42,0.96))] px-6 text-center'>
					<div className='flex h-24 w-24 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-sky-200'>
						<HiMiniUserGroup className='h-11 w-11' />
					</div>
					<p className='mt-5 text-lg font-semibold text-white'>{conversationSummary.fullName}</p>
					<p className='mt-2 max-w-md text-sm leading-7 text-slate-300'>
						{callState.phase === "dialing"
							? "Your group call is ringing. As soon as someone joins, their video will appear here."
							: "Waiting for members to join the video call."}
					</p>
				</div>
			);
		}

		return (
			<div className={`grid h-full min-h-0 gap-3 p-3 ${remoteCount > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
				{remoteParticipants.map((participant) => (
					<div
						key={participant.userId || participant.user?._id || "participant"}
						className='relative min-h-0 overflow-hidden rounded-[24px] border border-white/10 bg-slate-950'
					>
						{participant.stream?.getVideoTracks?.().length ? (
							<StreamVideo stream={participant.stream} muted className='h-full w-full object-cover' />
						) : (
							<div className='flex h-full w-full flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(2,6,23,0.92),rgba(15,23,42,0.96))] px-4 text-center'>
								<img
									src={resolveAvatar(participant.user)}
									alt={participant.user?.fullName || "Participant"}
									className='h-20 w-20 rounded-full object-cover'
								/>
								<p className='mt-4 text-sm font-semibold text-white'>
									{participant.user?.fullName || "Participant"}
								</p>
							</div>
						)}
						<div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/88 to-transparent px-4 pb-4 pt-10'>
							<p className='truncate text-sm font-semibold text-white'>
								{participant.user?.fullName || "Participant"}
							</p>
						</div>
					</div>
				))}
			</div>
		);
	};

	const remoteAudioElements = remoteParticipants.map((participant) => (
		<StreamAudio key={`remote-audio-${participant.userId || participant.user?._id || "participant"}`} stream={participant.stream} />
	));

	if (isMinimized && canMinimizeCall) {
		return createPortal(
			<div className='pointer-events-none fixed inset-0 z-[205]'>
				{minimizedMode === "avatar" ? (
					<button
						ref={floatingContainerRef}
						type='button'
						style={floatingWidgetStyle}
						onPointerDown={(event) => startFloatingDrag(event, { onTap: handleShowMiniCard })}
						className={`pointer-events-auto absolute h-14 w-14 overflow-hidden rounded-full border border-white/15 bg-slate-950/90 shadow-[0_20px_48px_rgba(2,6,23,0.56)] ring-1 ring-white/10 touch-none transition ${
							hasFloatingPosition ? "opacity-100" : "opacity-0"
						} ${isDraggingFloating ? "cursor-grabbing" : "cursor-grab"}`}
						aria-label='Expand call controls'
						title='Drag to move. Tap to expand.'
					>
						<img src={leadAvatar} alt={title} className='h-full w-full object-cover' />
						<span className='absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-slate-950 bg-emerald-400'></span>
					</button>
				) : (
					<div
						ref={floatingContainerRef}
						style={floatingWidgetStyle}
						onPointerDown={(event) => startFloatingDrag(event, { ignoreInteractiveTargets: true })}
						className={`pointer-events-auto absolute w-[min(90vw,360px)] touch-none rounded-[22px] border border-white/12 bg-[linear-gradient(145deg,rgba(5,12,25,0.96),rgba(9,18,34,0.94))] p-3 shadow-[0_24px_60px_rgba(2,6,23,0.62)] backdrop-blur-xl transition ${
							hasFloatingPosition ? "opacity-100" : "opacity-0"
						}`}
					>
						<div className='flex items-center gap-3'>
							<button
								type='button'
								onPointerDown={(event) => startFloatingDrag(event)}
								className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs font-semibold tracking-[0.14em] text-slate-200 touch-none transition hover:bg-white/[0.1] ${
									isDraggingFloating ? "cursor-grabbing" : "cursor-grab"
								}`}
								aria-label='Drag call widget'
								title='Drag call widget'
							>
								::
							</button>
							<div className='h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20'>
								<img src={leadAvatar} alt={title} className='h-full w-full object-cover' />
							</div>
							<div className='min-w-0 flex-1'>
								<p className='truncate text-sm font-semibold text-white'>{title}</p>
								<p className='mt-0.5 truncate text-xs text-slate-300'>{statusLabel}</p>
							</div>
							<button
								type='button'
								onClick={handleShowAvatarOnly}
								className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-100 transition hover:bg-white/[0.1]'
								aria-label='Show avatar only'
								title='Show avatar only'
							>
								<IoContractOutline className='h-4.5 w-4.5' />
							</button>
							<button
								type='button'
								onClick={handleToggleMinimized}
								className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-100 transition hover:bg-white/[0.1]'
								aria-label='Restore call window'
								title='Restore call window'
							>
								<IoChevronUp className='h-5 w-5' />
							</button>
						</div>

						<div className='mt-3 flex items-center justify-end gap-2'>
							<button
								type='button'
								onClick={() => void handleSwitchMediaType()}
								disabled={isSwitchingMedia}
								className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55'
								aria-label={switchMediaLabel}
								title={switchMediaLabel}
							>
								{isSwitchingMedia ? (
									<span className='loading loading-spinner loading-xs'></span>
								) : isVideoCall ? (
									<HiMiniPhone className='h-4.5 w-4.5' />
								) : (
									<HiMiniVideoCamera className='h-4.5 w-4.5' />
								)}
							</button>
							<button
								type='button'
								onClick={toggleMute}
								className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 transition ${
									callState.isMuted
										? "bg-amber-500/14 text-amber-100 hover:bg-amber-500/20"
										: "bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
								}`}
								aria-label={callState.isMuted ? "Unmute microphone" : "Mute microphone"}
								title={callState.isMuted ? "Unmute microphone" : "Mute microphone"}
							>
								{callState.isMuted ? <IoMicOffOutline className='h-4.5 w-4.5' /> : <IoMicOutline className='h-4.5 w-4.5' />}
							</button>
							<button
								type='button'
								onClick={endCurrentCall}
								className='inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_14px_28px_rgba(244,63,94,0.3)] transition hover:bg-rose-400'
								aria-label={isGroupCall ? "Leave or end group call" : "End call"}
								title={isGroupCall ? "Leave or end group call" : "End call"}
							>
								<HiMiniPhoneXMark className='h-5 w-5' />
							</button>
						</div>
					</div>
				)}
				{remoteAudioElements}
				<audio ref={ringtoneAudioRef} src={callRingtone} loop preload='auto' />
			</div>,
			document.body
		);
	}

	return createPortal(
		<div className='fixed inset-x-0 top-0 z-[200] flex h-[var(--app-viewport-height)] items-center justify-center bg-slate-950/78 px-3 py-[calc(env(safe-area-inset-bottom,0px)+0.6rem)] backdrop-blur-md sm:px-4 sm:py-4'>
			<div
				className={`flex w-full max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.94))] p-4 shadow-[0_28px_90px_rgba(2,6,23,0.65)] sm:max-h-[calc(100dvh-2rem)] sm:p-6 ${
					isVideoCall ? "max-w-5xl" : "max-w-xl"
				}`}
			>
				<div className='flex items-center justify-between gap-2'>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300/70'>
						{isGroupCall ? (isVideoCall ? "Group video call" : "Group voice call") : isVideoCall ? "Video call" : "Voice call"}
					</p>
					<div className='flex items-center gap-2'>
						{callState.phase !== "incoming" ? (
							<button
								type='button'
								onClick={() => void handleSwitchMediaType()}
								disabled={isSwitchingMedia}
								className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55'
								aria-label={switchMediaLabel}
								title={switchMediaLabel}
							>
								{isSwitchingMedia ? (
									<span className='loading loading-spinner loading-xs'></span>
								) : isVideoCall ? (
									<HiMiniPhone className='h-4.5 w-4.5' />
								) : (
									<HiMiniVideoCamera className='h-4.5 w-4.5' />
								)}
							</button>
						) : null}
						{canMinimizeCall ? (
							<button
								type='button'
								onClick={handleToggleMinimized}
								className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.08]'
								aria-label='Minimize call window'
								title='Minimize call window'
							>
								<IoChevronDown className='h-5 w-5' />
							</button>
						) : null}
					</div>
				</div>

				{isVideoCall ? (
					<div className='mt-4 flex min-h-0 flex-1'>
						<div
							ref={videoStageRef}
							className={`relative overflow-hidden bg-slate-950 shadow-[0_18px_42px_rgba(14,165,233,0.12)] ${
								isFullscreen
									? "h-full w-full rounded-none border-0"
									: "h-[min(58dvh,42rem)] w-full rounded-[26px] border border-white/12 sm:h-[min(62dvh,44rem)]"
							}`}
						>
							{isGroupCall ? (
								renderGroupVideoTiles()
							) : shouldShowMainDirectVideo ? (
								<StreamVideo
									stream={mainDirectStream}
									muted
									mirrored={isShowingLocalInMain}
									className='h-full w-full object-cover'
								/>
							) : (
								<div className='flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_46%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(15,23,42,0.96))] px-6 text-center'>
									<img src={leadAvatar} alt={title} className='h-24 w-24 rounded-full object-cover' />
									<p className='mt-5 text-lg font-semibold text-white'>{title}</p>
									<p className='mt-2 text-sm text-slate-300'>{statusLabel}</p>
								</div>
							)}

							<div className='absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-slate-950/80 via-slate-950/32 to-transparent p-4'>
								<div className='min-w-0'>
									<p className='truncate text-lg font-semibold text-white'>{title}</p>
									<p className='mt-1 text-sm text-slate-300'>{subtitle || statusLabel}</p>
									{isGroupCall ? (
										<p className='mt-1 text-xs uppercase tracking-[0.24em] text-sky-200/70'>
											{participantCount} participant{participantCount === 1 ? "" : "s"}
										</p>
									) : (
										<div className='mt-2 flex flex-wrap items-center gap-2'>
											<VerifiedBadge user={primaryUser} compact />
											<DeveloperBadge user={primaryUser} compact />
										</div>
									)}
								</div>
								<div className='flex items-center gap-2'>
									{callState.canInvite && callState.phase !== "incoming" ? (
										<button
											type='button'
											onClick={() => setShowInviteModal(true)}
											className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/55 text-slate-100 transition hover:bg-slate-900/85'
											aria-label='Invite someone else'
											title='Invite someone else'
										>
											<HiOutlineUserPlus className='h-5 w-5' />
										</button>
									) : null}
									{supportsFullscreen ? (
										<button
											type='button'
											onClick={toggleFullscreen}
											className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/55 text-slate-100 transition hover:bg-slate-900/85'
											aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
											title={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
										>
											{isFullscreen ? (
												<IoContractOutline className='h-5 w-5' />
											) : (
												<IoExpandOutline className='h-5 w-5' />
											)}
										</button>
									) : null}
									<div className='rounded-full border border-white/10 bg-slate-950/55 px-3 py-1 text-xs font-medium text-slate-100'>
										{statusLabel}
									</div>
									{isScreenSharing ? (
										<div className='rounded-full border border-emerald-300/20 bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-100'>
											Sharing screen
										</div>
									) : null}
								</div>
							</div>

							{localHasVideo ? (
								<button
									type='button'
									onClick={togglePrimaryVideo}
									disabled={!canSwapDirectVideo}
									className={`absolute bottom-4 right-4 overflow-hidden rounded-[18px] border border-white/12 bg-slate-950 shadow-[0_18px_32px_rgba(2,6,23,0.42)] sm:h-36 sm:w-28 ${
										canSwapDirectVideo
											? "cursor-pointer transition hover:scale-[1.02] hover:border-sky-300/40"
											: "cursor-default"
									} h-28 w-20`}
									aria-label='Swap video views'
									title={canSwapDirectVideo ? "Swap video views" : "Local preview"}
								>
									{isShowingLocalInMain ? (
										primaryRemoteParticipant?.stream ? (
											<StreamVideo
												stream={primaryRemoteParticipant.stream}
												muted
												className='h-full w-full object-cover'
											/>
										) : (
											<div className='flex h-full w-full flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(2,6,23,0.92),rgba(15,23,42,0.96))] px-2 text-center'>
												<img
													src={resolveAvatar(primaryUser, 72)}
													alt={primaryUser?.fullName || "Remote user"}
													className='h-10 w-10 rounded-full object-cover sm:h-12 sm:w-12'
												/>
												<span className='mt-2 line-clamp-2 text-[10px] font-medium text-white sm:text-xs'>
													{primaryUser?.fullName || "Remote user"}
												</span>
											</div>
										)
									) : (
										<StreamVideo
											stream={localStream}
											muted
											mirrored
											className='h-full w-full object-cover'
										/>
									)}
								</button>
							) : callState.phase !== "incoming" ? (
								<div className='absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-medium text-slate-200'>
									<HiMiniVideoCamera className='h-4 w-4' />
									Camera unavailable
								</div>
							) : null}
						</div>
					</div>
				) : (
					<div className='mt-5 flex flex-col items-center text-center'>
						<img src={leadAvatar} alt={title} className='h-24 w-24 rounded-full border border-white/12 object-cover' />
						<h2 className='mt-4 text-2xl font-semibold text-white'>{title}</h2>
						<p className='mt-2 max-w-lg text-sm leading-7 text-slate-300'>{subtitle || statusLabel}</p>
						<p className='mt-3 text-sm font-medium text-slate-300'>{statusLabel}</p>

						{isGroupCall ? (
							<div className='mt-6 flex max-h-40 flex-wrap justify-center gap-2 overflow-y-auto'>
								{renderParticipantBadges()}
							</div>
						) : (
							<div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
								{primaryUser?.username ? (
									<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300'>
										@{primaryUser.username}
									</span>
								) : null}
								<VerifiedBadge user={primaryUser} compact />
								<DeveloperBadge user={primaryUser} compact />
							</div>
						)}
					</div>
				)}

				<div className='mt-5 flex items-center justify-center gap-3 sm:mt-6'>
					{callState.phase === "incoming" ? (
						<>
							<button
								type='button'
								onClick={declineIncomingCall}
								className='inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_18px_36px_rgba(244,63,94,0.28)] transition hover:bg-rose-400'
								aria-label='Decline call'
								title='Decline call'
							>
								<HiMiniPhoneXMark className='h-6 w-6' />
							</button>
							<button
								type='button'
								onClick={acceptIncomingCall}
								className='inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_18px_36px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400'
								aria-label='Accept call'
								title='Accept call'
							>
								<HiMiniPhone className='h-6 w-6' />
							</button>
						</>
					) : (
						<>
							{callState.canInvite ? (
								<button
									type='button'
									onClick={() => setShowInviteModal(true)}
									className='inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.08]'
									aria-label='Invite someone else'
									title='Invite someone else'
								>
									<HiOutlineUserPlus className='h-5 w-5' />
								</button>
							) : null}
							<button
								type='button'
								onClick={() => void handleSwitchMediaType()}
								disabled={isSwitchingMedia}
								className='inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55'
								aria-label={switchMediaLabel}
								title={switchMediaLabel}
							>
								{isSwitchingMedia ? (
									<span className='loading loading-spinner loading-xs'></span>
								) : isVideoCall ? (
									<HiMiniPhone className='h-5 w-5' />
								) : (
									<HiMiniVideoCamera className='h-5 w-5' />
								)}
							</button>
							{isVideoCall ? (
								<button
									type='button'
									onClick={toggleScreenShare}
									className={`inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 transition ${
										isScreenSharing
											? "bg-sky-500/18 text-sky-100 hover:bg-sky-500/25"
											: "bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
									}`}
									aria-label={isScreenSharing ? "Stop screen sharing" : "Share screen"}
									title={isScreenSharing ? "Stop screen sharing" : "Share screen"}
								>
									{isScreenSharing ? (
										<MdStopScreenShare className='h-5 w-5' />
									) : (
										<MdOutlineScreenShare className='h-5 w-5' />
									)}
								</button>
							) : null}
							<button
								type='button'
								onClick={toggleMute}
								className={`inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 transition ${
									callState.isMuted
										? "bg-amber-500/14 text-amber-100 hover:bg-amber-500/20"
										: "bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
								}`}
								aria-label={callState.isMuted ? "Unmute microphone" : "Mute microphone"}
								title={callState.isMuted ? "Unmute microphone" : "Mute microphone"}
							>
								{callState.isMuted ? (
									<IoMicOffOutline className='h-5 w-5' />
								) : (
									<IoMicOutline className='h-5 w-5' />
								)}
							</button>
							<button
								type='button'
								onClick={endCurrentCall}
								className='inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_18px_36px_rgba(244,63,94,0.28)] transition hover:bg-rose-400'
								aria-label={isGroupCall ? "Leave or end group call" : "End call"}
								title={isGroupCall ? "Leave or end group call" : "End call"}
							>
								<HiMiniPhoneXMark className='h-6 w-6' />
							</button>
						</>
					)}
				</div>

				{showInviteModal ? (
					<div className='fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/78 px-4 backdrop-blur-sm'>
						<div className='w-full max-w-lg rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.96))] p-5 shadow-[0_28px_90px_rgba(2,6,23,0.65)]'>
							<div className='flex items-start justify-between gap-4'>
								<div>
									<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/75'>Add people</p>
									<h3 className='mt-2 text-xl font-semibold text-white'>Invite more users into this call</h3>
								</div>
								<button
									type='button'
									onClick={() => setShowInviteModal(false)}
									className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]'
								>
									Close
								</button>
							</div>

							<div className='custom-scrollbar mt-5 max-h-[50vh] space-y-2 overflow-y-auto pr-1'>
								{loadingInviteCandidates ? (
									<div className='rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
										Loading users...
									</div>
								) : inviteCandidates.length === 0 ? (
									<div className='rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
										No more users available for this call.
									</div>
								) : (
									inviteCandidates.map((user) => {
										const isSelected = selectedInviteeIds.includes(user._id);
										return (
											<button
												key={user._id}
												type='button'
												onClick={() => toggleInvitee(user._id)}
												className={`flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition ${
													isSelected
														? "border-sky-300/30 bg-sky-500/10"
														: "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
												}`}
											>
												<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
													<img src={resolveAvatar(user, 88)} alt={user.fullName} className='h-full w-full object-cover' />
												</div>
												<div className='min-w-0 flex-1'>
													<p className='truncate text-sm font-semibold text-white'>{user.fullName}</p>
													<p className='truncate text-xs text-slate-400'>@{user.username}</p>
												</div>
												<span
													className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
														isSelected
															? "border-sky-300/20 bg-sky-500/12 text-sky-100"
															: "border-white/10 bg-white/[0.04] text-slate-400"
													}`}
												>
													{isSelected ? "Selected" : "Add"}
												</span>
											</button>
										);
									})
								)}
							</div>

							<div className='mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end'>
								<button
									type='button'
									onClick={() => setShowInviteModal(false)}
									className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
								>
									Cancel
								</button>
								<button
									type='button'
									onClick={handleInviteParticipants}
									disabled={selectedInviteeIds.length === 0 || isInviting}
									className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-45'
								>
									{isInviting ? "Inviting..." : `Invite ${selectedInviteeIds.length || ""}`.trim()}
								</button>
							</div>
						</div>
					</div>
				) : null}

				{remoteAudioElements}
				<audio ref={ringtoneAudioRef} src={callRingtone} loop preload='auto' />
			</div>
		</div>,
		document.body
	);
};

export default VoiceCallOverlay;
