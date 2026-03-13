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

const Conversation = ({ conversation }) => {
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

	const lastMessagePreview = conversation?.lastMessage || "Start a conversation";
	const lastMessageTime = conversation?.lastMessageAt ? extractTime(conversation.lastMessageAt) : "";
	const unreadCount = Number.isFinite(conversation?.unreadCount) ? conversation.unreadCount : 0;
	const hasUnread = unreadCount > 0;
	const secondaryLine = isGroupConversation
		? `${conversation.isPrivate ? "Private" : "Public"} group · ${conversation.memberCount || 1} members${
				conversation.isMember === false ? " · Join available" : ""
		  }`
		: `@${conversation.username}${isOnline ? " · online" : ""}`;
	const nameClassName = isSelected ? "text-white" : "text-slate-100";
	const usernameClassName = isSelected ? "text-sky-100/85" : "text-slate-500";
	const previewClassName = isSelected
		? "text-sky-50/90"
			: hasUnread
			? "font-medium text-slate-100"
			: "text-slate-400";
	const timeClassName = isSelected ? "text-sky-100/80" : hasUnread ? "text-sky-300" : "text-slate-500";

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

	const handleClick = () => {
		startTransition(() => {
			setSelectedConversation(conversation);
			setShowSidebar(false);
		});
	};

	const handleAvatarClick = (event) => {
		event.stopPropagation();
		setShowUserInfo(true);
	};

	return (
		<>
			<div
				className={`conversation-row group flex cursor-pointer items-center gap-2.5 rounded-[22px] border px-3 py-2.5 transition-colors duration-150 ${
					isSelected
						? "border-sky-300/45 bg-[linear-gradient(135deg,rgba(14,165,233,0.85),rgba(6,182,212,0.9))] shadow-[0_20px_42px_rgba(14,165,233,0.22)]"
						: "border-transparent bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.04]"
				}`}
				onClick={handleClick}
			>
				<div className='relative shrink-0'>
					<button
						type='button'
						className='relative h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'
						onClick={handleAvatarClick}
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
