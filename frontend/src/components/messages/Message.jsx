import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { BsCopy, BsReply, BsTrash } from "react-icons/bs";
import { HiOutlinePhone, HiOutlineVideoCamera } from "react-icons/hi2";
import { IoAttachOutline, IoDocumentOutline, IoDownloadOutline, IoImageOutline, IoVideocamOutline } from "react-icons/io5";
import { useAuthContext } from "../../context/AuthContext";
import { useCallContext } from "../../context/CallContext";
import { extractTime } from "../../utils/extractTime";
import { getFlagOnlyState } from "../../utils/flagEmoji";
import useConversation from "../../zustand/useConversation";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import getDefaultAvatar from "../../utils/defaultAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import { CHAT_AUDIO_CONTROL_EVENT, stopAllChatAudio } from "../../utils/audioPlayback";
import {
	formatAttachmentSize,
	getAttachmentDownloadUrl,
	getAttachmentKindLabel,
	getAttachmentLabel,
	getMessageSummaryText,
	isImageAttachment,
	isVideoAttachment,
} from "../../utils/messageAttachments";
import FlagText from "../common/FlagText";
const STORY_OPEN_REQUEST_EVENT = "chat:open-story-from-message";

const getEmojiOnlyState = (value) => {
	const trimmedValue = typeof value === "string" ? value.trim() : "";
	if (!trimmedValue) return false;

	const emojiCount = (trimmedValue.match(/\p{Extended_Pictographic}/gu) || []).length;
	const strippedValue = trimmedValue
		.replace(/\p{Extended_Pictographic}/gu, "")
		.replace(/\p{Emoji_Component}/gu, "")
		.replace(/\u200D/gu, "")
		.replace(/\uFE0F/gu, "")
		.replace(/\s/gu, "");

	return emojiCount > 0 && strippedValue.length === 0;
};

const getSafeAudioValue = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);

const getCopyValue = (message) => {
	if (message?.audio) return message.audio;
	if (message?.attachment?.url) return message.attachment.url;
	return message?.message || "";
};

const formatCallDuration = (totalSeconds = 0) => {
	const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const seconds = safeSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const Message = ({
	message,
	onDeleteMessage,
	onJumpToMessage,
	isHighlighted,
	repliedMessage,
	contextMenuMessageId,
	setContextMenuMessageId,
	scrollContainerRef,
}) => {
	const MENU_WIDTH = 208;
	const MENU_HEIGHT = 164;
	const MENU_GAP = 12;
	const { authUser } = useAuthContext();
	const { callState, joinExistingCall, isCallClosedForUi, getClosedCallInfo } = useCallContext();
	const { selectedConversation } = useConversation();
	const fromMe = message.senderId === authUser._id;
	const formattedTime = extractTime(message.createdAt);
	const chatClassName = fromMe ? "chat-end" : "chat-start";
	const isGroupConversation = selectedConversation?.type === "GROUP";
	const senderProfile = !fromMe && isGroupConversation ? message.sender : selectedConversation;
	const profilePic = fromMe ? authUser?.profilePic : senderProfile?.profilePic;
	const isEmojiOnlyMessage = getEmojiOnlyState(message.message);
	const { isFlagOnly: isFlagOnlyMessage, flagCount } = getFlagOnlyState(message.message);
	const fallbackAvatar = getDefaultAvatar(fromMe ? authUser?.gender : senderProfile?.gender);
	const resolvedProfilePic = getAvatarUrl(profilePic, 64);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleteType, setDeleteType] = useState("me");
	const [isDeleting, setIsDeleting] = useState(false);
	const [isHandlingInvite, setIsHandlingInvite] = useState(false);
	const [menuPosition, setMenuPosition] = useState(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1);
	const fallbackAudioDuration = getSafeAudioValue(message.audioDurationSeconds);

	const avatarImgRef = useRef(null);
	const messageRef = useRef(null);
	const audioRef = useRef(null);

	useEffect(() => {
		setAvatarSrc(resolvedProfilePic || fallbackAvatar);
		setAvatarLoaded(!resolvedProfilePic);
	}, [resolvedProfilePic, fallbackAvatar]);

	useEffect(() => {
		const img = avatarImgRef.current;
		if (img?.complete && img.naturalWidth > 0) {
			setAvatarLoaded(true);
		}
	}, [avatarSrc]);

	useEffect(() => {
		if (contextMenuMessageId !== message._id) {
			setMenuPosition(null);
		}
	}, [contextMenuMessageId, message._id]);

	useEffect(() => {
		setIsPlaying(false);
		setProgress(0);
		setDuration(0);
	}, [message.audio]);

	useEffect(() => {
		const handleAudioControl = (event) => {
			const audio = audioRef.current;
			if (!audio) return;

			const { type, exceptId, reset } = event.detail ?? {};
			if (type !== "stop-all" || exceptId === message._id) {
				return;
			}

			audio.pause();
			if (reset) {
				audio.currentTime = 0;
				setProgress(0);
			}
			setIsPlaying(false);
		};

		window.addEventListener(CHAT_AUDIO_CONTROL_EVENT, handleAudioControl);
		return () => window.removeEventListener(CHAT_AUDIO_CONTROL_EVENT, handleAudioControl);
	}, [message._id]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return undefined;

		const updateProgress = () => {
			setProgress(getSafeAudioValue(audio.currentTime));
		};

		const setAudioDuration = () => {
			setDuration(getSafeAudioValue(audio.duration));
		};

		const handleEnded = () => {
			setIsPlaying(false);
			setProgress(0);
		};

		const handlePause = () => {
			setIsPlaying(false);
		};

		setAudioDuration();
		audio.addEventListener("timeupdate", updateProgress);
		audio.addEventListener("loadedmetadata", setAudioDuration);
		audio.addEventListener("loadeddata", setAudioDuration);
		audio.addEventListener("durationchange", setAudioDuration);
		audio.addEventListener("canplay", setAudioDuration);
		audio.addEventListener("ended", handleEnded);
		audio.addEventListener("pause", handlePause);

		return () => {
			audio.removeEventListener("timeupdate", updateProgress);
			audio.removeEventListener("loadedmetadata", setAudioDuration);
			audio.removeEventListener("loadeddata", setAudioDuration);
			audio.removeEventListener("durationchange", setAudioDuration);
			audio.removeEventListener("canplay", setAudioDuration);
			audio.removeEventListener("ended", handleEnded);
			audio.removeEventListener("pause", handlePause);
		};
	}, [message.audio]);

	const confirmDelete = async () => {
		if (isDeleting) return;

		const { messages, removeMessage, restoreMessage } = useConversation.getState();
		const messageIndex = messages.findIndex((currentMessage) => currentMessage._id === message._id);

		setIsDeleting(true);
		setShowDeleteModal(false);
		setDeleteType("me");
		(onDeleteMessage || removeMessage)?.(message._id);

		try {
			const response = await fetch(`/api/messages/${message._id}?deleteType=${deleteType}`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});

			if (!response.ok) {
				throw new Error("Failed to delete message");
			}

			window.dispatchEvent(new Event("chat:conversations-refresh"));
		} catch (error) {
			restoreMessage(message, messageIndex);
			toast.error(error.message);
		} finally {
			setIsDeleting(false);
		}
	};

	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;

		if (isPlaying) {
			audio.pause();
			setIsPlaying(false);
			return;
		}

		stopAllChatAudio({ exceptId: message._id, reset: true });
		audio
			.play()
			.then(() => {
				setIsPlaying(true);
			})
			.catch(() => {
				setIsPlaying(false);
			});
	};

	const changePlaybackRate = () => {
		const audio = audioRef.current;
		if (!audio) return;

		const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
		audio.playbackRate = nextRate;
		setPlaybackRate(nextRate);
	};

	const handleContextMenu = (event) => {
		event.preventDefault();
		event.stopPropagation();

		const containerRect = scrollContainerRef?.current?.getBoundingClientRect() ?? {
			top: 12,
			left: 12,
			right: window.innerWidth - 12,
			bottom: window.innerHeight - 12,
		};

		const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
		const minTop = Math.max(12, containerRect.top + 8);
		const maxTop = Math.max(minTop, Math.min(window.innerHeight - MENU_HEIGHT - 12, containerRect.bottom - MENU_HEIGHT - 8));
		const top = clamp(event.clientY - MENU_HEIGHT / 2, minTop, maxTop);

		const spaceLeft = event.clientX - containerRect.left;
		const spaceRight = containerRect.right - event.clientX;
		const canOpenLeft = spaceLeft >= MENU_WIDTH + MENU_GAP;
		const canOpenRight = spaceRight >= MENU_WIDTH + MENU_GAP;

		let left;
		if (fromMe && canOpenLeft) {
			left = event.clientX - MENU_WIDTH - MENU_GAP;
		} else if (!fromMe && canOpenRight) {
			left = event.clientX + MENU_GAP;
		} else if (canOpenLeft) {
			left = event.clientX - MENU_WIDTH - MENU_GAP;
		} else if (canOpenRight) {
			left = event.clientX + MENU_GAP;
		} else {
			const minLeft = Math.max(12, containerRect.left + 8);
			const maxLeft = Math.max(minLeft, Math.min(window.innerWidth - MENU_WIDTH - 12, containerRect.right - MENU_WIDTH - 8));
			left = clamp(event.clientX - MENU_WIDTH / 2, minLeft, maxLeft);
		}

		setMenuPosition({ top, left });

		setContextMenuMessageId(message._id);
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(getCopyValue(message));
			toast.success(message.audio ? "Audio link copied" : message.attachment ? "Attachment link copied" : "Message copied", { duration: 1400 });
			setContextMenuMessageId(null);
			setMenuPosition(null);
		} catch {
			toast.error("Copy failed");
		}
	};

	const formatAudioTime = (seconds) => {
		const safeSeconds = getSafeAudioValue(seconds);
		const mins = Math.floor(safeSeconds / 60);
		const secs = Math.floor(safeSeconds % 60);
		return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
	};

	const displayedAudioDuration = duration > 0 ? duration : fallbackAudioDuration;
	const progressPercentage =
		displayedAudioDuration > 0
			? Math.min(100, (getSafeAudioValue(progress) / displayedAudioDuration) * 100)
			: 0;

	const bubbleClassName = fromMe
		? "border border-sky-300/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.92),rgba(59,130,246,0.92))] text-white shadow-[0_16px_32px_rgba(14,165,233,0.2)]"
		: "border border-white/8 bg-slate-900/80 text-slate-100 shadow-[0_14px_28px_rgba(2,6,23,0.18)]";

	const replyClassName = fromMe
		? "border-l-white/70 bg-white/12 text-sky-50"
		: "border-l-sky-400/70 bg-slate-950/35 text-slate-300";

	const metaClassName = fromMe ? "text-sky-50/85" : "text-slate-400";
	const shakeClass = message.shouldShake ? "shake" : "";
	const highlightClassName = isHighlighted
		? fromMe
			? "ring-2 ring-white/80 ring-offset-2 ring-offset-sky-500/20"
			: "ring-2 ring-sky-300/80 ring-offset-2 ring-offset-slate-950/40"
		: "";
	const flagMessageClassName = isFlagOnlyMessage
		? "inline-flex flex-wrap items-center gap-1.5"
		: "";
	const flagImageClassName = isFlagOnlyMessage
		? flagCount === 1
			? "inline-block h-[1.28em] w-[1.9em] align-[-0.16em] rounded-[0.2em] object-cover sm:h-[1.36em] sm:w-[2.02em]"
			: "inline-block h-[1.08em] w-[1.62em] align-[-0.15em] rounded-[0.18em] object-cover sm:h-[1.14em] sm:w-[1.72em]"
			: "inline-block h-[1.02em] w-[1.5em] align-[-0.16em] rounded-[0.16em] object-cover";
	const attachmentDownloadUrl = getAttachmentDownloadUrl(message);

	const handleInvitationResponse = async (action) => {
		if (!message.isGroupInvite || !message.groupInvite || isHandlingInvite) return;

		setIsHandlingInvite(true);
		try {
			const response = await fetch(`/api/conversations/group-invites/${message._id}/respond`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ action }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to respond to invitation");
			}

			useConversation.getState().updateMessage(message._id, data.message);
			if (action === "ACCEPT" && data.joinedConversation?._id) {
				window.dispatchEvent(
					new CustomEvent("chat:conversation-restored", {
						detail: { conversation: data.joinedConversation },
					})
				);
				toast.success("You joined the group");
			} else {
				toast.success("Invitation declined");
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsHandlingInvite(false);
		}
	};

	const openStoryFromMessage = () => {
		const interaction = message?.storyInteraction;
		if (!interaction?.storyId || !interaction?.storyOwnerId) {
			toast.error("Story reference unavailable");
			return;
		}

		window.dispatchEvent(
			new CustomEvent(STORY_OPEN_REQUEST_EVENT, {
				detail: {
					storyId: interaction.storyId,
					userId: interaction.storyOwnerId,
					story: {
						_id: interaction.storyId,
						userId: interaction.storyOwnerId,
						text: interaction.storyText || "",
						mediaUrl: interaction.storyMediaUrl || null,
						mediaType: interaction.storyMediaType || "TEXT",
						isOwn: interaction.storyOwnerId === authUser?._id,
						isSeen: false,
						viewCount: null,
						createdAt: message.createdAt,
						updatedAt: message.updatedAt,
						expiresAt: null,
						author: {
							_id: interaction.storyOwnerId,
							fullName: interaction.storyOwnerName || selectedConversation?.fullName || "Story owner",
							username: selectedConversation?.username || "story",
							profilePic: selectedConversation?.profilePic || "",
							gender: selectedConversation?.gender || null,
						},
					},
				},
			})
		);
	};

	if (message.isCallMessage && message.callInfo) {
		const callInfo = message.callInfo;
		const effectiveCallInfo = getClosedCallInfo?.(callInfo) || callInfo;
		const isLocallyClosed = isCallClosedForUi?.(effectiveCallInfo.callId);
		const isLiveCall = !isLocallyClosed && effectiveCallInfo.status !== "ENDED";
		const isCurrentCall = callState.callId === effectiveCallInfo.callId && callState.phase !== "idle";
		const canJoinFromMessage =
			isLiveCall &&
			!isCurrentCall &&
			Boolean(selectedConversation?._id) &&
			callState.phase === "idle";

		return (
			<div
				id={`message-${message._id}`}
				data-message-id={message._id}
				ref={messageRef}
				className={`chat ${chatClassName} scroll-mt-24`}
				style={{ position: "relative" }}
			>
				<div className='chat-image avatar'>
					<div className='relative w-9 overflow-hidden rounded-full ring-1 ring-white/10 md:w-10'>
						<img
							alt='call avatar'
							src={avatarSrc}
							className='h-full w-full object-cover'
							onError={() => {
								setAvatarSrc(fallbackAvatar);
								setAvatarLoaded(true);
							}}
						/>
					</div>
				</div>

				<div
					className={`max-w-[85%] rounded-[28px] border px-4 py-4 md:max-w-[72%] lg:max-w-[68%] xl:max-w-[62%] ${
						fromMe
							? "border-sky-300/24 bg-[linear-gradient(135deg,rgba(14,165,233,0.2),rgba(59,130,246,0.22))] text-white"
							: "border-white/10 bg-slate-900/85 text-slate-100"
					}`}
				>
					<div className='flex flex-wrap items-center justify-between gap-3'>
						<div className='flex items-center gap-3'>
							<div
								className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${
									effectiveCallInfo.mediaType === "video"
										? "bg-sky-500/16 text-sky-100"
										: "bg-emerald-500/14 text-emerald-100"
								}`}
							>
								{effectiveCallInfo.mediaType === "video" ? (
									<HiOutlineVideoCamera className='h-6 w-6' />
								) : (
									<HiOutlinePhone className='h-6 w-6' />
								)}
							</div>
							<div>
								<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/75'>
									{effectiveCallInfo.mediaType === "video" ? "Video call" : "Voice call"}
								</p>
								<p className='mt-1 text-base font-semibold text-white'>
									{isLiveCall
										? `${effectiveCallInfo.initiatorName} is calling`
										: `${effectiveCallInfo.mediaType === "video" ? "Video" : "Voice"} call ended`}
								</p>
							</div>
						</div>

						<span
							className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
								isCurrentCall
									? "border-sky-300/20 bg-sky-500/12 text-sky-100"
									: isLiveCall
										? "border-emerald-300/20 bg-emerald-500/12 text-emerald-100"
										: "border-white/10 bg-white/[0.05] text-slate-300"
							}`}
						>
							{isCurrentCall ? "In call" : isLiveCall ? "Live now" : "Ended"}
						</span>
					</div>

					<div className='mt-4 grid gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-3'>
						<div>
							<p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400'>Started</p>
							<p className='mt-2 text-sm font-medium text-white'>{extractTime(effectiveCallInfo.startedAt || message.createdAt)}</p>
						</div>
						<div>
							<p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400'>Joined</p>
							<p className='mt-2 text-sm font-medium text-white'>
								{effectiveCallInfo.joinedParticipantCount || effectiveCallInfo.activeParticipantCount || 0} people
							</p>
						</div>
						<div>
							<p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400'>
								{isLiveCall ? "Active now" : "Duration"}
							</p>
							<p className='mt-2 text-sm font-medium text-white'>
								{isLiveCall
									? `${effectiveCallInfo.activeParticipantCount || 1} inside`
									: formatCallDuration(effectiveCallInfo.durationSeconds)}
							</p>
						</div>
					</div>

					<p className='mt-3 text-sm leading-6 text-slate-200'>
						{effectiveCallInfo.previewText}
						{isLiveCall && effectiveCallInfo.callMode === "group" ? " Group members can still join while the call is live." : ""}
					</p>

					{canJoinFromMessage ? (
						<div className='mt-4 flex flex-wrap gap-2'>
							<button
								type='button'
								onClick={() => joinExistingCall({ callId: effectiveCallInfo.callId })}
								className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:from-sky-400 hover:to-cyan-400'
							>
								Join call
							</button>
						</div>
					) : null}

					<div className={`mt-3 flex items-center justify-end gap-1 text-[11px] ${metaClassName}`}>
						<span>{formattedTime}</span>
					</div>
				</div>
			</div>
		);
	}

	if (message.isGroupInvite && message.groupInvite) {
		const inviteGroup = {
			type: "GROUP",
			isGroup: true,
			fullName: message.groupInvite.groupTitle,
			profilePic: message.groupInvite.groupProfilePic,
		};
		const inviteGroupAvatar =
			getAvatarUrl(message.groupInvite.groupProfilePic, 96) || getConversationFallbackAvatar(inviteGroup);
		const invitationStatus = message.groupInvite.status || "PENDING";
		const isPendingInvitation = invitationStatus === "PENDING";
		const isInviteReceiver = message.receiverId === authUser._id;

		return (
			<div
				id={`message-${message._id}`}
				data-message-id={message._id}
				ref={messageRef}
				className={`chat ${chatClassName} scroll-mt-24`}
				style={{ position: "relative" }}
			>
				<div className='chat-image avatar'>
					<div className='relative w-9 overflow-hidden rounded-full ring-1 ring-white/10 md:w-10'>
						<img
							alt='group avatar'
							src={inviteGroupAvatar}
							className='h-full w-full object-cover'
							onError={(event) => {
								event.currentTarget.src = getConversationFallbackAvatar(inviteGroup);
							}}
						/>
					</div>
				</div>

				<div
					className={`max-w-[85%] rounded-[28px] border px-4 py-4 md:max-w-[72%] lg:max-w-[68%] xl:max-w-[62%] ${
						fromMe
							? "border-sky-300/24 bg-[linear-gradient(135deg,rgba(14,165,233,0.2),rgba(59,130,246,0.22))] text-white"
							: "border-white/10 bg-slate-900/85 text-slate-100"
					}`}
				>
					<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/75'>Group invitation</p>
					<div className='mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center'>
						<div className='h-12 w-12 overflow-hidden rounded-full ring-1 ring-white/10'>
							<img
								src={inviteGroupAvatar}
								alt={message.groupInvite.groupTitle}
								className='h-full w-full object-cover'
								onError={(event) => {
									event.currentTarget.src = getConversationFallbackAvatar(inviteGroup);
								}}
							/>
						</div>
						<div className='min-w-0'>
							<p className='break-words text-sm font-semibold leading-5 text-white sm:truncate'>
								{message.groupInvite.groupTitle}
							</p>
							<p className='mt-1 break-words text-xs leading-5 text-slate-300'>
								<span className='block sm:inline'>Invited by {message.groupInvite.inviterName}</span>
								<span className='hidden px-1 text-slate-500 sm:inline'>·</span>
								<span className='block sm:inline'>{message.groupInvite.isPrivate ? "Private group" : "Public group"}</span>
							</p>
						</div>
						<span
							className={`col-start-2 justify-self-start rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:col-start-auto sm:justify-self-end ${
								invitationStatus === "ACCEPTED"
									? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
									: invitationStatus === "DECLINED"
										? "border-rose-300/20 bg-rose-500/10 text-rose-100"
										: "border-amber-300/20 bg-amber-500/10 text-amber-100"
							}`}
						>
							{invitationStatus}
						</span>
					</div>

					<p className='mt-3 text-sm leading-6 text-slate-200'>
						{message.groupInvite.groupDescription?.trim() || "Open the group when you are ready to join."}
					</p>

					{isInviteReceiver && isPendingInvitation ? (
						<div className='mt-4 flex flex-wrap gap-2'>
							<button
								type='button'
								onClick={() => handleInvitationResponse("ACCEPT")}
								className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
								disabled={isHandlingInvite}
							>
								{isHandlingInvite ? "Saving..." : "Accept"}
							</button>
							<button
								type='button'
								onClick={() => handleInvitationResponse("DECLINE")}
								className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-70'
								disabled={isHandlingInvite}
							>
								Decline
							</button>
						</div>
					) : null}

					<div className={`mt-3 flex items-center justify-end gap-1 text-[11px] ${metaClassName}`}>
						<span>{formattedTime}</span>
					</div>
				</div>
			</div>
		);
	}

	if (message.isStoryInteraction && message.storyInteraction) {
		const interaction = message.storyInteraction;
		const isReaction = interaction.interactionType === "REACTION";
		const summaryText = isReaction
			? `${interaction.emoji || "❤️"} Reacted to your story`
			: `💬 Replied to your story${interaction.comment ? `: ${interaction.comment}` : ""}`;
		const storyMediaType = interaction.storyMediaType || "TEXT";
		const hasStoryImage = storyMediaType === "IMAGE" && Boolean(interaction.storyMediaUrl);
		const hasStoryVideo = storyMediaType === "VIDEO" && Boolean(interaction.storyMediaUrl);

		return (
			<div
				id={`message-${message._id}`}
				data-message-id={message._id}
				ref={messageRef}
				className={`chat ${chatClassName} ${shakeClass} scroll-mt-24`}
				style={{ position: "relative" }}
			>
				<div className='chat-image avatar'>
					<div className='relative w-9 rounded-full overflow-hidden ring-1 ring-white/10 md:w-10'>
						<div
							className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
								avatarLoaded ? "opacity-0" : "opacity-100"
							}`}
						></div>
						<img
							alt='user avatar'
							ref={avatarImgRef}
							src={avatarSrc}
							className={`h-full w-full object-cover transition-opacity duration-200 ${
								avatarLoaded ? "opacity-100" : "opacity-0"
							}`}
							loading='eager'
							decoding='async'
							onLoad={() => setAvatarLoaded(true)}
							onError={() => {
								setAvatarSrc(fallbackAvatar);
								setAvatarLoaded(true);
							}}
						/>
					</div>
				</div>

				<div
					className={`chat-bubble before:hidden after:hidden overflow-visible max-w-[85%] cursor-pointer px-3 py-3 text-sm transition-shadow duration-300 md:max-w-[72%] md:px-4 md:py-3.5 lg:max-w-[68%] xl:max-w-[62%] ${bubbleClassName} ${highlightClassName} ${
						fromMe ? "rounded-[24px] rounded-br-[10px]" : "rounded-[24px] rounded-bl-[10px]"
					}`}
					onContextMenu={handleContextMenu}
				>
					<p className='text-sm font-medium leading-6 text-slate-100'>
						<FlagText text={summaryText} />
					</p>

					<button
						type='button'
						onClick={(event) => {
							event.stopPropagation();
							openStoryFromMessage();
						}}
						className={`mt-3 block w-full overflow-hidden rounded-[20px] border text-left transition ${
							fromMe
								? "border-white/20 bg-white/10 hover:bg-white/16"
								: "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
						}`}
						title='Open related story'
					>
						{hasStoryImage ? (
							<img src={interaction.storyMediaUrl} alt='Story preview' className='max-h-[180px] w-full object-cover' />
						) : hasStoryVideo ? (
							<div className='flex h-[140px] items-center justify-center bg-slate-950/35'>
								<div className='rounded-full border border-cyan-300/25 bg-cyan-500/12 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100'>
									Video story
								</div>
							</div>
						) : (
							<div className='px-4 py-4'>
								<p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75'>Story</p>
							</div>
						)}
						<div className='border-t border-white/10 px-4 py-3'>
							<p className='line-clamp-2 text-xs leading-5 text-slate-200'>
								{interaction.storyText?.trim() || "Tap to open story"}
							</p>
						</div>
					</button>

					<div className={`mt-2 flex items-center justify-end gap-1 text-[11px] ${metaClassName}`}>
						<span>{message.isPending ? "Sending..." : formattedTime}</span>
						{fromMe && !message.isPending ? <span>{message.isSeen ? <span className='text-blue-200'>✓✓</span> : "✓"}</span> : null}
					</div>
				</div>
			</div>
		);
	}

	if (message.isSystem) {
		return (
			<div
				id={`message-${message._id}`}
				data-message-id={message._id}
				ref={messageRef}
				className='scroll-mt-24 px-2 py-1.5'
			>
				<div className='mx-auto flex max-w-xl flex-col items-center rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3 text-center shadow-[0_16px_36px_rgba(2,6,23,0.2)]'>
					<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300/75'>Group update</p>
					<p className='mt-2 text-sm leading-6 text-slate-100'>
						<FlagText text={message.systemText || message.message} />
					</p>
					<span className='mt-2 text-[11px] text-slate-400'>{formattedTime}</span>
				</div>
			</div>
		);
	}

	return (
		<div
			id={`message-${message._id}`}
			data-message-id={message._id}
			ref={messageRef}
			className={`chat ${chatClassName} ${shakeClass} scroll-mt-24`}
			style={{ position: "relative" }}
		>
			<div className='chat-image avatar'>
				<div className='relative w-9 rounded-full overflow-hidden ring-1 ring-white/10 md:w-10'>
					<div
						className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
							avatarLoaded ? "opacity-0" : "opacity-100"
						}`}
					></div>
					<img
						alt='user avatar'
						ref={avatarImgRef}
						src={avatarSrc}
						className={`h-full w-full object-cover transition-opacity duration-200 ${
							avatarLoaded ? "opacity-100" : "opacity-0"
						}`}
						loading='eager'
						decoding='async'
						onLoad={() => setAvatarLoaded(true)}
						onError={() => {
							setAvatarSrc(fallbackAvatar);
							setAvatarLoaded(true);
						}}
					/>
				</div>
			</div>

			<div
				className={`chat-bubble before:hidden after:hidden overflow-visible max-w-[85%] cursor-pointer px-3 py-3 text-sm transition-shadow duration-300 md:max-w-[72%] md:px-4 md:py-3.5 lg:max-w-[68%] xl:max-w-[62%] ${bubbleClassName} ${highlightClassName} ${
					fromMe ? "rounded-[24px] rounded-br-[10px]" : "rounded-[24px] rounded-bl-[10px]"
				}`}
				onContextMenu={handleContextMenu}
			>
				{!fromMe && isGroupConversation && message.sender?.fullName ? (
					<p className='mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300/85'>
						{message.sender.fullName}
					</p>
				) : null}

				{repliedMessage ? (
					<button
						type='button'
						className={`custom-scrollbar mb-2 block max-h-[78px] w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-[18px] border-l-4 px-3 py-2 text-left text-xs leading-5 transition [overflow-wrap:anywhere] hover:opacity-90 ${replyClassName}`}
						onClick={(event) => {
							event.stopPropagation();
							onJumpToMessage?.(repliedMessage._id);
						}}
						title='Go to original message'
					>
						<FlagText text={getMessageSummaryText(repliedMessage)} />
					</button>
				) : null}

				{message.audio ? (
					<div className='w-full min-w-0 max-w-full sm:min-w-[220px]'>
						<div
							className={`flex w-full min-w-0 max-w-full items-center gap-2 rounded-[20px] border px-2.5 py-2.5 sm:gap-3 sm:px-3 sm:py-3 ${
								fromMe ? "border-white/15 bg-white/10" : "border-white/8 bg-white/[0.03]"
							}`}
						>
							<button
								type='button'
								className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10 ${
									fromMe ? "bg-white/15 hover:bg-white/20" : "bg-slate-800 hover:bg-slate-700"
								}`}
								onClick={(event) => {
									event.stopPropagation();
									togglePlay();
								}}
							>
								{isPlaying ? (
									<svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' fill='currentColor' viewBox='0 0 24 24'>
										<rect x='6' y='5' width='4' height='14' rx='1' ry='1' />
										<rect x='14' y='5' width='4' height='14' rx='1' ry='1' />
									</svg>
								) : (
									<svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' fill='currentColor' viewBox='0 0 24 24'>
										<path d='M8 5v14l11-7z' />
									</svg>
								)}
							</button>

							<div className='min-w-0 flex-1'>
								<div className={`relative h-2 overflow-hidden rounded-full ${fromMe ? "bg-white/20" : "bg-slate-700"}`}>
									<div
										className={`absolute inset-y-0 left-0 rounded-full ${fromMe ? "bg-white" : "bg-sky-400"}`}
										style={{
											width: `${progressPercentage}%`,
										}}
									></div>
								</div>
								<div className={`mt-2 grid grid-cols-2 items-center gap-2 text-[10px] tabular-nums sm:text-[11px] ${metaClassName}`}>
									<span className='min-w-[2.5rem] text-left'>{formatAudioTime(progress)}</span>
									<span className='min-w-[2.5rem] text-right'>{formatAudioTime(displayedAudioDuration)}</span>
								</div>
							</div>

							<button
								type='button'
								className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${
									fromMe ? "bg-white/15 text-white" : "bg-slate-800 text-slate-200"
								}`}
								onClick={(event) => {
									event.stopPropagation();
									changePlaybackRate();
								}}
							>
								{playbackRate}x
							</button>

							<audio ref={audioRef} src={message.audio} preload='auto' />
						</div>
					</div>
				) : (
					<>
						{message.attachment ? (
							<div className='w-full min-w-0 max-w-full'>
								{isImageAttachment(message.attachment) ? (
									<a
										href={message.attachment.url}
										target='_blank'
										rel='noreferrer'
										className='block overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/30'
										onClick={(event) => event.stopPropagation()}
									>
										<img
											src={message.attachment.url}
											alt={getAttachmentLabel(message.attachment)}
											className='max-h-[360px] w-full object-cover'
										/>
									</a>
								) : isVideoAttachment(message.attachment) ? (
									<video
										controls
										src={message.attachment.url}
										className='max-h-[360px] w-full rounded-[20px] border border-white/10 bg-slate-950/45'
										onClick={(event) => event.stopPropagation()}
									>
										Your browser does not support video playback.
									</video>
								) : (
									<div
										className={`flex items-center gap-3 rounded-[20px] border px-3 py-3 ${
											fromMe ? "border-white/15 bg-white/10" : "border-white/8 bg-white/[0.03]"
										}`}
									>
										<div
											className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] ${
												fromMe ? "bg-white/14 text-white" : "bg-slate-800 text-slate-200"
											}`}
										>
											{message.attachment.type === "PDF" ? (
												<IoDocumentOutline className='h-6 w-6' />
											) : message.attachment.type === "IMAGE" ? (
												<IoImageOutline className='h-6 w-6' />
											) : message.attachment.type === "VIDEO" ? (
												<IoVideocamOutline className='h-6 w-6' />
											) : (
												<IoAttachOutline className='h-6 w-6' />
											)}
										</div>

										<div className='min-w-0 flex-1'>
											<p className='truncate text-sm font-semibold text-white'>
												{getAttachmentLabel(message.attachment)}
											</p>
											<p className={`mt-1 text-xs ${metaClassName}`}>
												{[
													getAttachmentKindLabel(message.attachment),
													formatAttachmentSize(message.attachment.fileSize),
												]
													.filter(Boolean)
													.join(" · ")}
											</p>
										</div>

										<a
											href={attachmentDownloadUrl || message.attachment.url}
											download={message.attachment.fileName || undefined}
											className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
												fromMe ? "bg-white/14 text-white hover:bg-white/22" : "bg-slate-800 text-slate-100 hover:bg-slate-700"
											}`}
											onClick={(event) => event.stopPropagation()}
											title='Open attachment'
										>
											<IoDownloadOutline className='h-5 w-5' />
										</a>
									</div>
								)}
							</div>
						) : null}

						{message.message ? (
							<p
								className={`w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
									message.attachment
										? "mt-3 leading-6"
										: isEmojiOnlyMessage
											? "text-[28px] leading-[1.35] tracking-[0.08em] sm:text-[32px]"
											: isFlagOnlyMessage
												? "leading-[1.22]"
												: "leading-6"
								}`}
							>
								<FlagText
									text={message.message}
									className={flagMessageClassName}
									imgClassName={flagImageClassName}
								/>
							</p>
						) : null}
					</>
				)}

				<div className={`mt-2 flex items-center justify-end gap-1 text-[11px] ${metaClassName}`}>
					<span>{message.isPending ? "Sending..." : formattedTime}</span>
					{fromMe && !message.isPending ? <span>{message.isSeen ? <span className='text-blue-200'>✓✓</span> : "✓"}</span> : null}
				</div>

				{contextMenuMessageId === message._id && menuPosition
					? createPortal(
						<ul
							className='fixed z-[120] w-52 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/95 p-1 shadow-[0_20px_42px_rgba(2,6,23,0.45)]'
							style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
							onClick={(event) => event.stopPropagation()}
							onMouseDown={(event) => event.stopPropagation()}
						>
						<li>
							<button
								type='button'
								className='flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-white/[0.06]'
								onClick={(event) => {
									event.stopPropagation();
									useConversation.getState().setRepliedMessage(message);
									setContextMenuMessageId(null);
									setMenuPosition(null);
								}}
							>
								<BsReply className='h-4 w-4' />
								<span>Reply</span>
							</button>
						</li>
						<li>
							<button
								type='button'
								className='flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-white/[0.06]'
								onClick={(event) => {
									event.stopPropagation();
									handleCopy();
								}}
							>
								<BsCopy className='h-4 w-4' />
								<span>{message.audio ? "Copy audio link" : message.attachment ? "Copy attachment link" : "Copy message"}</span>
							</button>
						</li>
						<li>
							<button
								type='button'
								className='flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-rose-200 transition hover:bg-rose-500/12'
								onClick={(event) => {
									event.stopPropagation();
									setContextMenuMessageId(null);
									setMenuPosition(null);
									setShowDeleteModal(true);
								}}
							>
								<BsTrash className='h-4 w-4' />
								<span>Delete</span>
							</button>
						</li>
						</ul>,
						document.body
					)
					: null}
			</div>

			{showDeleteModal
				? createPortal(
					<div className='fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm'>
						<div className='w-full max-w-sm rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_32px_80px_rgba(2,6,23,0.55)]'>
							<h2 className='text-lg font-semibold text-white'>Delete message?</h2>
							<p className='mt-2 text-sm leading-6 text-slate-400'>
								Choose whether to remove this message only from your chat or from everyone.
							</p>

							<div className='mt-5 space-y-3'>
								<label className='flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200'>
									<input
										type='radio'
										name='deleteType'
										value='me'
										checked={deleteType === "me"}
										onChange={() => setDeleteType("me")}
										className='radio radio-sm radio-primary'
									/>
									<span>Delete for me</span>
								</label>

								{message.senderId === authUser._id ? (
									<label className='flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200'>
										<input
											type='radio'
											name='deleteType'
											value='everyone'
											checked={deleteType === "everyone"}
											onChange={() => setDeleteType("everyone")}
											className='radio radio-sm radio-primary'
										/>
										<span>Delete for everyone</span>
									</label>
								) : null}
							</div>

							<div className='mt-6 flex justify-end gap-3'>
								<button
									type='button'
									className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
									onClick={() => setShowDeleteModal(false)}
								>
									Cancel
								</button>
								<button
									type='button'
									className='rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400'
									onClick={confirmDelete}
									disabled={isDeleting}
								>
									{isDeleting ? "Deleting..." : "Delete"}
								</button>
							</div>
						</div>
					</div>,
					document.body
				)
				: null}
		</div>
	);
};

export default Message;
