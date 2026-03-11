import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineEye, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import { IoPause, IoPlay, IoSend } from "react-icons/io5";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const IMAGE_STORY_DURATION_MS = 5500;
const TEXT_STORY_DURATION_MS = 6500;
const FALLBACK_VIDEO_DURATION_MS = 9000;
const NAVIGATION_LOCK_MS = 220;

const getUserId = (user) => user?._id || user?.id || null;

const formatStoryAge = (createdAt) => {
	if (!createdAt) return "now";
	const elapsedMs = Date.now() - new Date(createdAt).getTime();
	if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return "now";

	const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
	if (elapsedMinutes < 1) return "now";
	if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) return `${elapsedHours}h`;

	const elapsedDays = Math.floor(elapsedHours / 24);
	return `${elapsedDays}d`;
};

const formatSeenAt = (seenAt) => {
	if (!seenAt) return "Unknown time";
	const parsedDate = new Date(seenAt);
	if (Number.isNaN(parsedDate.getTime())) return "Unknown time";

	return `${parsedDate.toLocaleDateString()} ${parsedDate.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	})}`;
};

const pickDefaultStoryIndex = (group, targetStoryId) => {
	if (!Array.isArray(group?.stories) || group.stories.length === 0) return 0;
	if (targetStoryId) {
		const targetIndex = group.stories.findIndex((story) => story?._id === targetStoryId);
		if (targetIndex >= 0) return targetIndex;
	}

	const unseenIndex = group.stories.findIndex((story) => !story?.isSeen && !story?.isOwn);
	return unseenIndex >= 0 ? unseenIndex : 0;
};

const clampIndex = (value, max) => {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(value, Math.max(max, 0)));
};

const StoryViewerModal = ({
	open,
	storyGroups = [],
	initialTarget = null,
	authUserId = null,
	onClose,
	onSeen,
	onDelete,
	onGetViewers,
	onReact,
	onComment,
}) => {
	const orderedGroups = useMemo(
		() => (Array.isArray(storyGroups) ? storyGroups.filter((group) => Array.isArray(group?.stories) && group.stories.length > 0) : []),
		[storyGroups]
	);
	const [activeGroupUserId, setActiveGroupUserId] = useState(null);
	const [activeStoryId, setActiveStoryId] = useState(null);
	const [videoDurationMs, setVideoDurationMs] = useState(0);
	const [mediaLoadError, setMediaLoadError] = useState(false);
	const videoRef = useRef(null);
	const autoNextTimeoutRef = useRef(null);
	const storyElapsedBeforePauseRef = useRef(0);
	const storyRunStartedAtRef = useRef(0);
	const hasMarkedSeenRef = useRef(new Set());
	const initializedForOpenRef = useRef(false);
	const navigationLockUntilRef = useRef(0);
	const [viewersOpen, setViewersOpen] = useState(false);
	const [viewers, setViewers] = useState([]);
	const [loadingViewers, setLoadingViewers] = useState(false);
	const [manualPaused, setManualPaused] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [sendingReply, setSendingReply] = useState(false);
	const [sendingReactionEmoji, setSendingReactionEmoji] = useState("");
	const reactionChoices = ["❤️", "🔥", "😂", "😍", "👏", "👍"];

	const clearAutoNextTimeout = useCallback(() => {
		if (autoNextTimeoutRef.current) {
			clearTimeout(autoNextTimeoutRef.current);
			autoNextTimeoutRef.current = null;
		}
	}, []);

	const resetProgressState = useCallback(() => {
		setVideoDurationMs(0);
		setMediaLoadError(false);
	}, []);

	useEffect(() => {
		if (!open) {
			clearAutoNextTimeout();
			hasMarkedSeenRef.current = new Set();
			initializedForOpenRef.current = false;
			navigationLockUntilRef.current = 0;
			setActiveGroupUserId(null);
			setActiveStoryId(null);
			storyElapsedBeforePauseRef.current = 0;
			storyRunStartedAtRef.current = 0;
			setManualPaused(false);
			setViewersOpen(false);
			setViewers([]);
			setReplyText("");
			setSendingReply(false);
			setSendingReactionEmoji("");
			resetProgressState();
		}
	}, [clearAutoNextTimeout, open, resetProgressState]);

	const setActiveByPosition = useCallback(
		(groupIndex, storyIndex) => {
			const targetGroup = orderedGroups[groupIndex];
			const targetStories = targetGroup?.stories || [];
			if (!targetGroup || targetStories.length === 0) {
				return false;
			}

			const safeStoryIndex = clampIndex(storyIndex, targetStories.length - 1);
			const targetStory = targetStories[safeStoryIndex];
			const targetUserId = getUserId(targetGroup.user);
			if (!targetStory?._id || !targetUserId) {
				return false;
			}

			setActiveGroupUserId(targetUserId);
			setActiveStoryId(targetStory._id);
			resetProgressState();
			return true;
		},
		[orderedGroups, resetProgressState]
	);

	useEffect(() => {
		if (!open || initializedForOpenRef.current || orderedGroups.length === 0) return;

		const targetUserId = initialTarget?.userId || null;
		const targetStoryId = initialTarget?.storyId || null;
		const selectedGroupIndex = targetUserId
			? orderedGroups.findIndex((group) => getUserId(group?.user) === targetUserId)
			: 0;
		const safeGroupIndex = selectedGroupIndex >= 0 ? selectedGroupIndex : 0;
		const selectedGroup = orderedGroups[safeGroupIndex];
		const initialStoryIndex = pickDefaultStoryIndex(selectedGroup, targetStoryId);

		setActiveByPosition(safeGroupIndex, initialStoryIndex);
		initializedForOpenRef.current = true;
	}, [initialTarget?.storyId, initialTarget?.userId, open, orderedGroups, setActiveByPosition]);

	const activeGroupIndex = useMemo(() => {
		if (!orderedGroups.length) return -1;
		const matchedIndex = orderedGroups.findIndex((group) => getUserId(group?.user) === activeGroupUserId);
		return matchedIndex >= 0 ? matchedIndex : 0;
	}, [activeGroupUserId, orderedGroups]);

	const activeGroup = activeGroupIndex >= 0 ? orderedGroups[activeGroupIndex] : null;
	const activeStories = activeGroup?.stories || [];
	const storyIndexById = activeStories.findIndex((story) => story?._id === activeStoryId);
	const activeStoryIndex = storyIndexById >= 0 ? storyIndexById : 0;
	const activeStory = activeStories[activeStoryIndex] || null;
	const activeAuthor = activeGroup?.user || null;
	const activeAuthorId = getUserId(activeAuthor);
	const isOwnStory = Boolean(activeStory?.isOwn || (activeAuthorId && activeAuthorId === authUserId));
	const isVideoStory = activeStory?.mediaType === "VIDEO" && Boolean(activeStory?.mediaUrl) && !mediaLoadError;
	const storyDurationMs = useMemo(() => {
		if (isVideoStory) {
			return Math.max(videoDurationMs || 0, FALLBACK_VIDEO_DURATION_MS);
		}

		return activeStory?.mediaType === "TEXT" ? TEXT_STORY_DURATION_MS : IMAGE_STORY_DURATION_MS;
	}, [activeStory?.mediaType, isVideoStory, videoDurationMs]);
	const isPlaybackPaused = manualPaused || viewersOpen || sendingReply || Boolean(sendingReactionEmoji);

	useEffect(() => {
		if (!open || !initializedForOpenRef.current || orderedGroups.length === 0) return;
		if (!activeGroupUserId || !activeStoryId) return;

		const nextGroupIndex = activeGroupIndex >= 0 ? activeGroupIndex : 0;
		const nextGroup = orderedGroups[nextGroupIndex];
		const nextStories = nextGroup?.stories || [];
		if (nextStories.length === 0) return;

		const nextStoryIndex = (() => {
			const currentIndex = nextStories.findIndex((story) => story?._id === activeStoryId);
			return currentIndex >= 0 ? currentIndex : pickDefaultStoryIndex(nextGroup, null);
		})();

		const nextStory = nextStories[clampIndex(nextStoryIndex, nextStories.length - 1)];
		const nextUserId = getUserId(nextGroup?.user);
		if (!nextStory?._id || !nextUserId) return;

		if (nextUserId !== activeGroupUserId || nextStory._id !== activeStoryId) {
			setActiveGroupUserId(nextUserId);
			setActiveStoryId(nextStory._id);
			resetProgressState();
		}
	}, [activeGroupIndex, activeGroupUserId, activeStoryId, open, orderedGroups, resetProgressState]);

	useEffect(() => {
		if (!activeStory?._id) return;
		setMediaLoadError(false);
		setReplyText("");
		storyElapsedBeforePauseRef.current = 0;
		storyRunStartedAtRef.current = open ? Date.now() : 0;
	}, [activeStory?._id]);

	const loadStoryViewers = useCallback(
		async (storyId) => {
			if (!storyId || typeof onGetViewers !== "function") return;

			setLoadingViewers(true);
			try {
				const result = await onGetViewers(storyId);
				if (result?.ok) {
					setViewers(Array.isArray(result.data) ? result.data : []);
					return;
				}
				setViewers([]);
			} finally {
				setLoadingViewers(false);
			}
		},
		[onGetViewers]
	);

	useEffect(() => {
		if (!viewersOpen || !isOwnStory || !activeStory?._id) return;
		void loadStoryViewers(activeStory._id);
	}, [activeStory?._id, isOwnStory, loadStoryViewers, viewersOpen]);

	useEffect(() => {
		if (isOwnStory) return;
		if (viewersOpen) {
			setViewersOpen(false);
		}
	}, [isOwnStory, viewersOpen]);

	const openViewersModal = useCallback(() => {
		if (!isOwnStory || !activeStory?._id) return;
		setViewersOpen(true);
		void loadStoryViewers(activeStory._id);
	}, [activeStory?._id, isOwnStory, loadStoryViewers]);

	const handleReaction = useCallback(
		async (emoji) => {
			if (isOwnStory || !activeStory?._id || typeof onReact !== "function") return;
			if (sendingReactionEmoji) return;

			setSendingReactionEmoji(emoji);
			try {
				await onReact(activeStory._id, emoji);
			} finally {
				setSendingReactionEmoji("");
			}
		},
		[activeStory?._id, isOwnStory, onReact, sendingReactionEmoji]
	);

	const handleCommentSubmit = useCallback(
		async (event) => {
			event.preventDefault();
			if (isOwnStory || !activeStory?._id || typeof onComment !== "function") return;

			const normalizedReply = replyText.trim();
			if (!normalizedReply || sendingReply) return;

			setSendingReply(true);
			try {
				const result = await onComment(activeStory._id, normalizedReply);
				if (result?.ok) {
					setReplyText("");
				}
			} finally {
				setSendingReply(false);
			}
		},
		[activeStory?._id, isOwnStory, onComment, replyText, sendingReply]
	);

	const acquireNavigationLock = useCallback(() => {
		const now = Date.now();
		if (now < navigationLockUntilRef.current) {
			return false;
		}
		navigationLockUntilRef.current = now + NAVIGATION_LOCK_MS;
		return true;
	}, [open]);

	const goNextStory = useCallback((options = {}) => {
		if (viewersOpen) return;
		const bypassLock = Boolean(options?.bypassLock);
		if (!bypassLock && !acquireNavigationLock()) {
			return;
		}

		if (!activeGroup) {
			onClose?.();
			return;
		}

		if (activeStoryIndex < activeStories.length - 1) {
			setActiveByPosition(activeGroupIndex, activeStoryIndex + 1);
			return;
		}

		if (activeGroupIndex < orderedGroups.length - 1) {
			setActiveByPosition(activeGroupIndex + 1, 0);
			return;
		}

		onClose?.();
	}, [acquireNavigationLock, activeGroup, activeGroupIndex, activeStories.length, activeStoryIndex, onClose, orderedGroups.length, setActiveByPosition, viewersOpen]);

	const goPreviousStory = useCallback((options = {}) => {
		if (viewersOpen) return;
		const bypassLock = Boolean(options?.bypassLock);
		if (!bypassLock && !acquireNavigationLock()) {
			return;
		}

		if (!activeGroup) {
			onClose?.();
			return;
		}

		if (activeStoryIndex > 0) {
			setActiveByPosition(activeGroupIndex, activeStoryIndex - 1);
			return;
		}

		if (activeGroupIndex > 0) {
			const previousGroupIndex = activeGroupIndex - 1;
			const previousGroupStories = orderedGroups[previousGroupIndex]?.stories || [];
			setActiveByPosition(previousGroupIndex, Math.max(previousGroupStories.length - 1, 0));
		}
	}, [acquireNavigationLock, activeGroup, activeGroupIndex, activeStoryIndex, onClose, orderedGroups, setActiveByPosition, viewersOpen]);

	useEffect(() => {
		if (!open || !activeStory?._id || isOwnStory) return;
		if (hasMarkedSeenRef.current.has(activeStory._id)) return;

		hasMarkedSeenRef.current.add(activeStory._id);
		void onSeen?.(activeStory._id);
	}, [activeStory?._id, isOwnStory, onSeen, open]);

	useEffect(() => {
		clearAutoNextTimeout();
		if (!open || !activeStory?._id) return undefined;

		if (isPlaybackPaused) {
			if (storyRunStartedAtRef.current > 0) {
				storyElapsedBeforePauseRef.current += Date.now() - storyRunStartedAtRef.current;
				storyRunStartedAtRef.current = 0;
			}
			return undefined;
		}

		if (storyRunStartedAtRef.current === 0) {
			storyRunStartedAtRef.current = Date.now();
		}

		const elapsedMs = storyElapsedBeforePauseRef.current + (Date.now() - storyRunStartedAtRef.current);
		const remainingMs = Math.max(storyDurationMs - elapsedMs, 0);

		if (remainingMs <= 0) {
			goNextStory({ bypassLock: true });
			return undefined;
		}

		autoNextTimeoutRef.current = setTimeout(() => {
			storyElapsedBeforePauseRef.current = storyDurationMs;
			storyRunStartedAtRef.current = 0;
			goNextStory({ bypassLock: true });
		}, remainingMs);

		return () => {
			clearAutoNextTimeout();
		};
	}, [activeStory?._id, clearAutoNextTimeout, goNextStory, isPlaybackPaused, open, storyDurationMs]);

	useEffect(() => {
		if (!isVideoStory) return;

		const activeVideo = videoRef.current;
		if (!activeVideo) return;

		if (isPlaybackPaused) {
			activeVideo.pause();
			return;
		}

		const playbackPromise = activeVideo.play();
		if (playbackPromise && typeof playbackPromise.catch === "function") {
			playbackPromise.catch(() => {});
		}
	}, [isPlaybackPaused, isVideoStory, activeStory?._id]);

	useEffect(() => {
		if (activeStory?.mediaType !== "VIDEO") return;

		const activeVideo = videoRef.current;
		if (!activeVideo) return;

		const onLoadedMetadata = () => {
			if (!Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) return;
			setVideoDurationMs(activeVideo.duration * 1000);
		};

		const onDurationChange = () => {
			if (!Number.isFinite(activeVideo.duration) || activeVideo.duration <= 0) return;
			setVideoDurationMs(activeVideo.duration * 1000);
		};

		activeVideo.addEventListener("loadedmetadata", onLoadedMetadata);
		activeVideo.addEventListener("durationchange", onDurationChange);
		return () => {
			activeVideo.removeEventListener("loadedmetadata", onLoadedMetadata);
			activeVideo.removeEventListener("durationchange", onDurationChange);
		};
	}, [activeStory?.mediaType, activeStory?._id]);

	if (!open || !activeStory || orderedGroups.length === 0) return null;

	const authorAvatar = getAvatarUrl(activeAuthor?.profilePic, 120) || getConversationFallbackAvatar(activeAuthor || {});
	const shouldShowImage = activeStory.mediaType === "IMAGE" && Boolean(activeStory.mediaUrl) && !mediaLoadError;
	const shouldShowVideo = activeStory.mediaType === "VIDEO" && Boolean(activeStory.mediaUrl) && !mediaLoadError;
	const shouldShowTextFallback = activeStory.mediaType === "TEXT" || !activeStory.mediaUrl || mediaLoadError;

	return (
		<div className='fixed inset-0 z-[220] bg-slate-950/96 backdrop-blur-md'>
			<div className='relative mx-auto flex h-full w-full max-w-3xl flex-col px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-4'>
				<div className='flex items-center gap-1.5 pb-3'>
					{activeStories.map((story, storyIndex) => {
						const isPastStory = storyIndex < activeStoryIndex;
						const isCurrentStory = storyIndex === activeStoryIndex;
						let indicator = <span className='block h-full w-0 rounded-full bg-white'></span>;

						if (isPastStory) {
							indicator = <span className='block h-full w-full rounded-full bg-white'></span>;
						} else if (isCurrentStory) {
							indicator = (
								<span
									key={`story-progress-${activeStory?._id}-${storyDurationMs}`}
									className='story-progress-current block h-full rounded-full bg-white'
									style={{ "--story-duration": `${storyDurationMs}ms`, animationPlayState: isPlaybackPaused ? "paused" : "running" }}
								></span>
							);
						}

						return (
							<span key={story?._id || `story-progress-${storyIndex}`} className='h-1 flex-1 rounded-full bg-white/20'>
								{indicator}
							</span>
						);
					})}
				</div>

				<div className='mb-3 flex items-center justify-between gap-3'>
					<div className='flex min-w-0 items-center gap-3'>
						<div className='h-10 w-10 overflow-hidden rounded-full ring-1 ring-white/20'>
							<img src={authorAvatar} alt={activeAuthor?.fullName || "Story author"} className='h-full w-full object-cover' />
						</div>
						<div className='min-w-0'>
							<p className='truncate text-sm font-semibold text-white'>{activeAuthor?.fullName || "Unknown user"}</p>
							<p className='text-xs text-slate-300'>{formatStoryAge(activeStory.createdAt)}</p>
						</div>
					</div>

					<div className='flex items-center gap-2'>
						<button
							type='button'
							onClick={() => setManualPaused((currentValue) => !currentValue)}
							title={manualPaused ? "Start story" : "Pause story"}
							aria-label={manualPaused ? "Start story" : "Pause story"}
							className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10'
						>
							{manualPaused ? <IoPlay className='h-4.5 w-4.5' /> : <IoPause className='h-4.5 w-4.5' />}
						</button>
						{isOwnStory ? (
							<button
								type='button'
								onClick={openViewersModal}
								className='inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:bg-white/10'
							>
								<HiOutlineEye className='h-4 w-4' />
								{viewersOpen ? viewers.length : Number.isFinite(activeStory.viewCount) ? activeStory.viewCount : 0}
							</button>
						) : null}
						<button
							type='button'
							onClick={onClose}
							className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition hover:bg-white/15'
							aria-label='Close stories'
						>
							<HiOutlineXMark className='h-5 w-5' />
						</button>
					</div>
				</div>

				<div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/70'>
					<button
						type='button'
						className='absolute inset-y-0 left-0 z-20 w-1/2 cursor-pointer'
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => goPreviousStory()}
						aria-label='Previous story'
					/>
					<button
						type='button'
						className='absolute inset-y-0 right-0 z-20 w-1/2 cursor-pointer'
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => goNextStory()}
						aria-label='Next story'
					/>

					{shouldShowImage ? (
						<img
							src={activeStory.mediaUrl}
							alt='Story media'
							className='h-full w-full object-contain'
							onError={() => setMediaLoadError(true)}
						/>
					) : null}

					{shouldShowVideo ? (
						<video
							ref={videoRef}
							src={activeStory.mediaUrl}
							className='h-full w-full object-contain'
							autoPlay
							muted
							playsInline
							onEnded={() => goNextStory({ bypassLock: true })}
							onError={() => setMediaLoadError(true)}
							onStalled={() => setMediaLoadError(true)}
						/>
					) : null}

					{shouldShowTextFallback ? (
						<div className='flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.28),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.26),transparent_34%),linear-gradient(145deg,rgba(2,6,23,0.94),rgba(15,23,42,0.96))] px-8 py-8 text-center'>
							<p className='max-w-lg text-2xl font-semibold leading-relaxed text-white sm:text-3xl'>
								{activeStory.text || "Story unavailable"}
							</p>
						</div>
					) : null}

					{activeStory.text && activeStory.mediaUrl ? (
						<div className='pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-slate-950/90 via-slate-900/35 to-transparent px-5 pb-6 pt-16'>
							<p className='text-center text-sm font-medium leading-6 text-slate-100 sm:text-base'>{activeStory.text}</p>
						</div>
					) : null}
				</div>

				<div className='mt-3 flex items-center justify-between'>
					{isOwnStory ? (
						<p className='shrink-0 whitespace-nowrap text-xs text-slate-400'>
							Story {activeStoryIndex + 1} of {activeStories.length}
						</p>
					) : null}
					{isOwnStory ? (
						<button
							type='button'
							onClick={async () => {
								const result = await onDelete?.(activeStory._id);
								if (result?.ok) {
									if (activeStories.length > 1 && activeStoryIndex === activeStories.length - 1) {
										goPreviousStory({ bypassLock: true });
										return;
									}

									goNextStory({ bypassLock: true });
								}
							}}
							className='inline-flex items-center gap-2 rounded-full border border-rose-300/25 bg-rose-500/12 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-300/45 hover:bg-rose-500/18'
						>
							<HiOutlineTrash className='h-4 w-4' />
							Delete
						</button>
					) : (
						<div className='w-full'>
							<div className='mb-2 flex items-center justify-between gap-2'>
								<p className='shrink-0 whitespace-nowrap text-xs text-slate-400'>
									Story {activeStoryIndex + 1} of {activeStories.length}
								</p>
								<div className='custom-scrollbar flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5'>
								{reactionChoices.map((emoji) => (
									<button
										key={`${activeStory?._id || "story"}-reaction-${emoji}`}
										type='button'
										onClick={() => void handleReaction(emoji)}
										disabled={Boolean(sendingReactionEmoji)}
										className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60 ${
											sendingReactionEmoji === emoji ? "scale-110 bg-cyan-500/20" : ""
										}`}
									>
											{emoji}
										</button>
									))}
								</div>
							</div>
							<form className='flex items-center gap-1.5' onSubmit={handleCommentSubmit}>
								<input
									type='text'
									value={replyText}
									onChange={(event) => setReplyText(event.target.value)}
									maxLength={700}
									placeholder='Reply to this story...'
									className='h-9 flex-1 rounded-full border border-white/15 bg-white/5 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/45 focus:bg-white/8'
								/>
								<button
									type='submit'
									disabled={sendingReply || !replyText.trim()}
									className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-500/20 text-cyan-100 transition hover:bg-cyan-500/28 disabled:cursor-not-allowed disabled:opacity-55'
									aria-label='Send story reply'
								>
									<IoSend className='h-4 w-4' />
								</button>
							</form>
						</div>
					)}
				</div>
			</div>

			{viewersOpen ? (
				<div
					className='fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm sm:p-5'
					onClick={() => setViewersOpen(false)}
				>
					<div
						className='w-full max-w-lg overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(145deg,rgba(2,8,23,0.98),rgba(9,18,35,0.96))] shadow-[0_24px_70px_rgba(2,6,23,0.64)]'
						onClick={(event) => event.stopPropagation()}
					>
						<div className='flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5'>
							<div>
								<p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75'>Story viewers</p>
								<p className='mt-1 text-xs text-slate-400'>
									{loadingViewers ? "Loading..." : `${viewers.length} viewed`}
								</p>
							</div>
							<button
								type='button'
								onClick={() => setViewersOpen(false)}
								className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12]'
							>
								<HiOutlineXMark className='h-5 w-5' />
							</button>
						</div>

						<div className='custom-scrollbar max-h-[60vh] overflow-y-auto p-3 sm:p-4'>
							{loadingViewers ? (
								<div className='space-y-2'>
									{Array.from({ length: 5 }).map((_, index) => (
										<div key={`story-viewer-skeleton-${index}`} className='flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3'>
											<div className='h-10 w-10 animate-pulse rounded-full bg-slate-700/60'></div>
											<div className='flex-1 space-y-2'>
												<div className='h-3 w-28 animate-pulse rounded bg-slate-700/60'></div>
												<div className='h-2.5 w-36 animate-pulse rounded bg-slate-800/70'></div>
											</div>
										</div>
									))}
								</div>
							) : viewers.length === 0 ? (
								<div className='rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-10 text-center'>
									<p className='text-sm text-slate-300'>Nobody viewed this story yet.</p>
								</div>
							) : (
								<div className='space-y-2'>
									{viewers.map((entry, index) => {
										const viewer = entry?.viewer || null;
										const viewerAvatar =
											getAvatarUrl(viewer?.profilePic, 72) || getConversationFallbackAvatar(viewer || {});

										return (
											<div key={`${viewer?._id || "viewer"}-${entry?.seenAt || index}`} className='flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3'>
												<div className='h-10 w-10 overflow-hidden rounded-full ring-1 ring-white/15'>
													<img src={viewerAvatar} alt={viewer?.fullName || "Viewer"} className='h-full w-full object-cover' />
												</div>
												<div className='min-w-0 flex-1'>
													<p className='truncate text-sm font-semibold text-slate-100'>
														{viewer?.fullName || "Unknown"}
													</p>
													<p className='truncate text-xs text-slate-400'>@{viewer?.username || "user"}</p>
												</div>
												<div className='text-right'>
													<p className='text-[11px] text-cyan-200/85'>Seen</p>
													<p className='mt-0.5 text-[11px] text-slate-500'>{formatSeenAt(entry?.seenAt)}</p>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
};

export default StoryViewerModal;
