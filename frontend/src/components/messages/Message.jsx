import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { BsCopy, BsReply, BsTrash } from "react-icons/bs";
import { useAuthContext } from "../../context/AuthContext";
import { extractTime } from "../../utils/extractTime";
import useConversation from "../../zustand/useConversation";
import getDefaultAvatar from "../../utils/defaultAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import { CHAT_AUDIO_CONTROL_EVENT, stopAllChatAudio } from "../../utils/audioPlayback";

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
	const { selectedConversation } = useConversation();
	const fromMe = message.senderId === authUser._id;
	const formattedTime = extractTime(message.createdAt);
	const chatClassName = fromMe ? "chat-end" : "chat-start";
	const profilePic = fromMe ? authUser?.profilePic : selectedConversation?.profilePic;
	const isEmojiOnlyMessage = getEmojiOnlyState(message.message);
	const fallbackAvatar = getDefaultAvatar(fromMe ? authUser?.gender : selectedConversation?.gender);
	const resolvedProfilePic = getAvatarUrl(profilePic, 64);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleteType, setDeleteType] = useState("me");
	const [isDeleting, setIsDeleting] = useState(false);
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
			await navigator.clipboard.writeText(message.audio ? message.audio : message.message || "");
			toast.success(message.audio ? "Audio link copied" : "Message copied", { duration: 1400 });
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
						{repliedMessage.audio ? "Audio message" : repliedMessage.message}
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
					<p
						className={`w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
							isEmojiOnlyMessage
								? "text-[28px] leading-[1.35] tracking-[0.08em] sm:text-[32px]"
								: "leading-6"
						}`}
					>
						{message.message}
					</p>
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
								<span>{message.audio ? "Copy audio link" : "Copy message"}</span>
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
