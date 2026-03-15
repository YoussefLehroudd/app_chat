import { startTransition, useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../zustand/useConversation";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import UserInfoModal from "../UserInfoModal";
import { extractTime } from "../../utils/extractTime";
import DeveloperBadge from "../common/DeveloperBadge";
import VerifiedBadge from "../common/VerifiedBadge";
import FlagText from "../common/FlagText";

const LONG_PRESS_DURATION_MS = 420;
const LONG_PRESS_MOVE_THRESHOLD = 10;

const Conversation = ({
	conversation,
	onContextMenu,
	onLongPress,
	isQuickActionTarget = false,
	isPinnedConversation = false,
	pinnedOrder = null,
	onPinnedDragStart,
	onPinnedDragOver,
	onPinnedDrop,
	onPinnedDragEnd,
}) => {
	const { selectedConversation, setSelectedConversation, setShowSidebar } = useConversation();
	const { onlineUsers } = useSocketContext();
	const isSelected = selectedConversation?._id === conversation._id;
	const isGroupConversation = conversation?.type === "GROUP";
	const isOnline = !isGroupConversation && onlineUsers.includes(conversation._id);

	const fallbackAvatar = getConversationFallbackAvatar(conversation);
	const resolvedProfilePic = getAvatarUrl(conversation?.profilePic, 96);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const [showUserInfo, setShowUserInfo] = useState(false);
	const imgRef = useRef(null);
	const longPressTimerRef = useRef(null);
	const longPressStartPointRef = useRef(null);
	const longPressTriggeredRef = useRef(false);
	const ignoreClickUntilRef = useRef(0);

	const lastMessagePreview = conversation?.lastMessage || "Start a conversation";
	const lastMessageTime = conversation?.lastMessageAt ? extractTime(conversation.lastMessageAt) : "";
	const unreadCount = Number.isFinite(conversation?.unreadCount) ? conversation.unreadCount : 0;
	const hasUnread = unreadCount > 0;
	const isArchivedConversation = Boolean(conversation?.isArchived);
	const isMutedConversation =
		Boolean(conversation?.mutedUntil) && new Date(conversation.mutedUntil).getTime() > Date.now();
	const isVisuallyActive = isSelected || isQuickActionTarget;
	const secondaryLine = isGroupConversation
		? `${conversation.isPrivate ? "Private" : "Public"} group · ${conversation.memberCount || 1} members${
				conversation.isMember === false ? " · Join available" : ""
		  }`
		: `@${conversation.username}${isOnline ? " · online" : ""}`;
	const nameClassName = isVisuallyActive
		? "text-white"
		: isArchivedConversation
			? "text-slate-300"
			: "text-slate-100";
	const usernameClassName = isVisuallyActive ? "text-sky-100/85" : "text-slate-500";
	const previewClassName = isVisuallyActive
		? "text-sky-50/90"
			: hasUnread
			? "font-medium text-slate-100"
			: "text-slate-400";
	const timeClassName = isVisuallyActive ? "text-sky-100/80" : hasUnread ? "text-sky-300" : "text-slate-500";

	useEffect(() => {
		setAvatarSrc(resolvedProfilePic || fallbackAvatar);
		setAvatarLoaded(!resolvedProfilePic);
	}, [resolvedProfilePic, fallbackAvatar]);

	useEffect(() => {
		const img = imgRef.current;
		if (img?.complete && img.naturalWidth > 0) {
			setAvatarLoaded(true);
		}
	}, [avatarSrc]);

	useEffect(() => {
		return () => {
			if (longPressTimerRef.current) {
				window.clearTimeout(longPressTimerRef.current);
			}
		};
	}, []);

	const handleClick = () => {
		if (Date.now() < ignoreClickUntilRef.current) {
			return;
		}

		startTransition(() => {
			setSelectedConversation(conversation);
			setShowSidebar(false);
		});
	};

	const handleAvatarClick = (event) => {
		event.stopPropagation();
		setShowUserInfo(true);
	};

	const clearLongPressTimer = () => {
		if (longPressTimerRef.current) {
			window.clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	};

	const handleTouchStart = (event) => {
		if (typeof onLongPress !== "function" || event.touches.length !== 1) {
			return;
		}

		const touch = event.touches[0];
		longPressTriggeredRef.current = false;
		longPressStartPointRef.current = { clientX: touch.clientX, clientY: touch.clientY };
		clearLongPressTimer();
		longPressTimerRef.current = window.setTimeout(() => {
			longPressTriggeredRef.current = true;
			ignoreClickUntilRef.current = Date.now() + 700;
			if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
				navigator.vibrate(12);
			}
			onLongPress?.({
				conversation,
				clientX: touch.clientX,
				clientY: touch.clientY,
			});
		}, LONG_PRESS_DURATION_MS);
	};

	const handleTouchMove = (event) => {
		if (!longPressStartPointRef.current || !longPressTimerRef.current || event.touches.length !== 1) {
			return;
		}

		const touch = event.touches[0];
		const movedX = Math.abs(touch.clientX - longPressStartPointRef.current.clientX);
		const movedY = Math.abs(touch.clientY - longPressStartPointRef.current.clientY);

		if (movedX > LONG_PRESS_MOVE_THRESHOLD || movedY > LONG_PRESS_MOVE_THRESHOLD) {
			clearLongPressTimer();
			longPressStartPointRef.current = null;
		}
	};

	const handleTouchEnd = (event) => {
		clearLongPressTimer();
		longPressStartPointRef.current = null;

		if (longPressTriggeredRef.current) {
			event.preventDefault();
			longPressTriggeredRef.current = false;
		}
	};

	const handleTouchCancel = () => {
		clearLongPressTimer();
		longPressStartPointRef.current = null;
		longPressTriggeredRef.current = false;
	};

	return (
		<>
			<div
				draggable={isPinnedConversation}
				onDragStart={isPinnedConversation ? onPinnedDragStart : undefined}
				onDragOver={isPinnedConversation ? onPinnedDragOver : undefined}
				onDrop={isPinnedConversation ? onPinnedDrop : undefined}
				onDragEnd={isPinnedConversation ? onPinnedDragEnd : undefined}
				onContextMenu={(event) => onContextMenu?.(event, conversation)}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				onTouchCancel={handleTouchCancel}
				style={{ WebkitTouchCallout: "none", touchAction: "pan-y" }}
				className={`conversation-row group flex cursor-pointer items-center gap-2.5 rounded-[22px] border px-3 py-2.5 transition-colors duration-150 ${
					isSelected
						? "border-sky-300/45 bg-[linear-gradient(135deg,rgba(14,165,233,0.85),rgba(6,182,212,0.9))] shadow-[0_20px_42px_rgba(14,165,233,0.22)]"
						: isQuickActionTarget
							? "border-cyan-300/34 bg-[linear-gradient(135deg,rgba(13,35,70,0.96),rgba(5,16,33,0.98))] shadow-[0_18px_34px_rgba(8,145,178,0.18)]"
						: isPinnedConversation
							? "border-cyan-300/14 bg-[linear-gradient(135deg,rgba(12,25,48,0.92),rgba(5,13,28,0.96))] hover:border-cyan-300/24 hover:bg-[linear-gradient(135deg,rgba(14,33,62,0.94),rgba(7,16,34,0.98))]"
						: "border-transparent bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.04]"
				} ${isPinnedConversation ? "cursor-grab active:cursor-grabbing" : ""}`}
				onClick={handleClick}
			>
				<div className='relative shrink-0'>
					<button
						type='button'
						className='relative h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'
						onClick={handleAvatarClick}
						onTouchStart={(event) => event.stopPropagation()}
						onTouchEnd={(event) => event.stopPropagation()}
						onTouchCancel={(event) => event.stopPropagation()}
						title='Show user info'
					>
						<div
							className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
								avatarLoaded ? "opacity-0" : "opacity-100"
							}`}
						></div>
						<img
							ref={imgRef}
							src={avatarSrc}
							alt={`${conversation.fullName} avatar`}
							className={`h-full w-full object-cover transition-opacity duration-200 ${
								avatarLoaded ? "opacity-100" : "opacity-0"
							}`}
							loading='lazy'
							decoding='async'
							fetchpriority='low'
							onLoad={() => setAvatarLoaded(true)}
							onError={() => {
								setAvatarSrc(fallbackAvatar);
								setAvatarLoaded(true);
							}}
						/>
					</button>
					<span
						className={`absolute right-0 top-0 h-3.5 w-3.5 -translate-y-[6%] translate-x-[6%] rounded-full border-2 ${
							isSelected ? "border-cyan-400 bg-emerald-300" : "border-slate-950 bg-emerald-400"
						} ${isOnline ? "opacity-100" : "opacity-0"}`}
					></span>
				</div>

				<div className='min-w-0 flex flex-1 items-start justify-between gap-2.5'>
					<div className='min-w-0 flex-1'>
						<div className='flex min-w-0 items-center gap-1.5'>
							<p className={`min-w-0 truncate text-[15px] font-semibold ${nameClassName}`}>
								{conversation.fullName}
							</p>
							{isGroupConversation ? (
								<span className='shrink-0 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-100'>
									{conversation.isPrivate ? "Private" : "Group"}
								</span>
							) : (
								<>
									<DeveloperBadge
										user={conversation}
										compact
										className='shrink-0 gap-0.5 px-1.5 py-0.5 text-[8px] tracking-[0.1em]'
									/>
									<VerifiedBadge user={conversation} compact className='shrink-0' />
								</>
							)}
							{isArchivedConversation ? (
								<span className='shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-300'>
									Archived
								</span>
							) : null}
							{isQuickActionTarget ? (
								<span className='shrink-0 rounded-full border border-cyan-300/24 bg-cyan-500/12 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-100'>
									Selected
								</span>
							) : null}
							{isPinnedConversation ? (
								<span className='shrink-0 rounded-full border border-cyan-300/18 bg-cyan-500/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-100'>
									Pinned {pinnedOrder ? `#${pinnedOrder}` : ""}
								</span>
							) : null}
							{isMutedConversation ? (
								<span className='shrink-0 rounded-full border border-amber-300/20 bg-amber-500/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-100'>
									Muted
								</span>
							) : null}
						</div>
						<p className={`mt-0.5 truncate text-[11px] ${usernameClassName}`}>
							{secondaryLine}
						</p>
						<p className={`mt-1 truncate pr-2 text-[13px] leading-5 ${previewClassName}`}>
							<FlagText text={lastMessagePreview} />
						</p>
					</div>

					<div className='flex shrink-0 self-stretch flex-col items-end justify-between pt-0.5'>
						{lastMessageTime ? <span className={`text-[11px] leading-none ${timeClassName}`}>{lastMessageTime}</span> : null}
						{hasUnread ? (
							<span className='inline-flex h-5 items-center justify-center rounded-full border border-sky-300/30 bg-sky-500/18 px-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-100 shadow-[0_10px_24px_rgba(14,165,233,0.18)]'>
								NEW
							</span>
						) : null}
					</div>
				</div>
			</div>

			<UserInfoModal user={conversation} open={showUserInfo} onClose={() => setShowUserInfo(false)} />
		</>
	);
};

export default Conversation;
