import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	HiMiniPhone,
	HiMiniPhoneXMark,
	HiMiniUserGroup,
	HiMiniVideoCamera,
	HiOutlineUserPlus,
} from "react-icons/hi2";
import { IoContractOutline, IoExpandOutline, IoMicOffOutline, IoMicOutline } from "react-icons/io5";
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
	if (typeof document.exitFullscreen === "function") {
		await document.exitFullscreen();
		return;
	}
	if (typeof document.webkitExitFullscreen === "function") {
		document.webkitExitFullscreen();
	}
};

const StreamVideo = ({ stream, className = "", muted = false, mirrored = false }) => {
	const videoRef = useRef(null);

	useEffect(() => {
		const videoElement = videoRef.current;
		if (!videoElement) return;
		videoElement.srcObject = stream || null;

		if (stream) {
			void videoElement.play().catch(() => {});
		}
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

		if (stream) {
			void audioElement.play().catch(() => {});
		}
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
	} = useCallContext();
	const ringtoneAudioRef = useRef(null);
	const videoStageRef = useRef(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isLocalVideoPrimary, setIsLocalVideoPrimary] = useState(false);
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
	}, [callState.callId]);

	useEffect(() => {
		if (!showInviteModal || !callState.callId) return;

		let isCancelled = false;
		const loadInviteCandidates = async () => {
			setLoadingInviteCandidates(true);
			try {
				const response = await fetch("/api/users/selectable");
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

	if (!shouldShowOverlay) return null;

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

	const title = isGroupCall ? conversationSummary.fullName : primaryUser.fullName;
	const subtitle = isGroupCall
		? primaryUser?._id
			? `${primaryUser.fullName} is calling this group`
			: `${participantCount} participants`
		: primaryUser?.username
			? `@${primaryUser.username}`
			: "";
	const isScreenSharing = Boolean(callState.isScreenSharing);

	const leadAvatar = isGroupCall ? resolveAvatar(conversationSummary) : resolveAvatar(primaryUser);

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
						key={participant.user?._id || Math.random().toString(36)}
						className='relative min-h-0 overflow-hidden rounded-[24px] border border-white/10 bg-slate-950'
					>
						{participant.stream?.getVideoTracks?.().length ? (
							<StreamVideo stream={participant.stream} className='h-full w-full object-cover' />
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

	return createPortal(
		<div className='fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/78 px-3 py-3 backdrop-blur-md sm:px-4 sm:py-4'>
			<div
				className={`flex w-full max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.94))] p-4 shadow-[0_28px_90px_rgba(2,6,23,0.65)] sm:max-h-[calc(100dvh-2rem)] sm:p-6 ${
					isVideoCall ? "max-w-5xl" : "max-w-xl"
				}`}
			>
				<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300/70'>
					{isGroupCall ? (isVideoCall ? "Group video call" : "Group voice call") : isVideoCall ? "Video call" : "Voice call"}
				</p>

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
									muted={isShowingLocalInMain}
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
											<StreamVideo stream={primaryRemoteParticipant.stream} className='h-full w-full object-cover' />
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

				{!isVideoCall
					? remoteParticipants.map((participant) => (
							<StreamAudio key={participant.user?._id || Math.random().toString(36)} stream={participant.stream} />
					  ))
					: null}
				<audio ref={ringtoneAudioRef} src={callRingtone} loop preload='auto' />
			</div>
		</div>,
		document.body
	);
};

export default VoiceCallOverlay;
