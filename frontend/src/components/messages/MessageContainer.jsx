import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { BsReply } from "react-icons/bs";
import { HiOutlineFaceSmile, HiOutlineMicrophone, HiOutlinePhone, HiOutlineTrash, HiOutlineVideoCamera } from "react-icons/hi2";
import { IoArrowBack, IoInformationCircleOutline } from "react-icons/io5";
import { TiMessages } from "react-icons/ti";
import toast from "react-hot-toast";
import useConversation from "../../zustand/useConversation";
import MessageInput from "./MessageInput";
import Messages from "./Messages";
import { useAuthContext } from "../../context/AuthContext";
import { useCallContext } from "../../context/CallContext";
import { useSocketContext } from "../../context/SocketContext";
import formatLastSeen from "../../utils/lastSeen";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import UserInfoModal from "../UserInfoModal";
import DeveloperBadge from "../common/DeveloperBadge";
import VerifiedBadge from "../common/VerifiedBadge";

const capabilityCards = [
	{
		icon: HiOutlineMicrophone,
		title: "Voice notes",
		description: "Record and send audio quickly from the composer.",
	},
	{
		icon: HiOutlineFaceSmile,
		title: "Emoji ready",
		description: "Open the picker without leaving the conversation flow.",
	},
	{
		icon: BsReply,
		title: "Reply focus",
		description: "Right-click a message to reply, copy or delete it.",
	},
];

const MessageContainer = () => {
	const { selectedConversation, setMessages, setSelectedConversation, setShowSidebar, setRepliedMessage } =
		useConversation();
	const { onlineUsers, lastSeenByUser } = useSocketContext();
	const { callState, isCallReady, startVoiceCall, startVideoCall } = useCallContext();
	const [showUserInfo, setShowUserInfo] = useState(false);
	const [showDeleteConversationModal, setShowDeleteConversationModal] = useState(false);
	const [isDeletingConversation, setIsDeletingConversation] = useState(false);
	const [isJoiningGroup, setIsJoiningGroup] = useState(false);
	const imgRef = useRef(null);
	const isGroupConversation = selectedConversation?.type === "GROUP";
	const canReadSelectedGroup = !isGroupConversation || selectedConversation?.isMember !== false;

	const fallbackAvatar = getConversationFallbackAvatar(selectedConversation);
	const resolvedProfilePic = getAvatarUrl(selectedConversation?.profilePic, 96);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);

	useEffect(() => {
		return () => setSelectedConversation(null);
	}, [setSelectedConversation]);

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

	const handleBackClick = () => {
		setShowSidebar(true);
		setSelectedConversation(null);
	};

	const handleDeleteConversation = async () => {
		if (!selectedConversation?._id || isDeletingConversation) return;

		const conversationToDelete = selectedConversation;
		const { messages } = useConversation.getState();
		setIsDeletingConversation(true);
		setShowDeleteConversationModal(false);
		setShowUserInfo(false);
		setMessages([]);
		setRepliedMessage(null);
		setShowSidebar(true);
		setSelectedConversation(null);
		window.dispatchEvent(
			new CustomEvent("chat:conversation-removed", {
				detail: { conversationId: conversationToDelete._id },
			})
		);

		try {
			const endpoint =
				conversationToDelete.type === "GROUP"
					? `/api/messages/conversation/group/${conversationToDelete._id}`
					: `/api/messages/conversation/${conversationToDelete._id}`;
			const response = await fetch(endpoint, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to delete conversation");
			}

			window.dispatchEvent(new Event("chat:conversations-refresh"));
			toast.success("Conversation deleted");
		} catch (error) {
			window.dispatchEvent(
				new CustomEvent("chat:conversation-restored", {
					detail: { conversation: conversationToDelete },
				})
			);
			setMessages(messages);
			setSelectedConversation(conversationToDelete);
			setShowSidebar(false);
			toast.error(error.message);
		} finally {
			setIsDeletingConversation(false);
		}
	};

	const handleJoinPublicGroup = async () => {
		if (!selectedConversation?._id || selectedConversation?.isMember !== false || selectedConversation?.isPrivate || isJoiningGroup) {
			return;
		}

		setIsJoiningGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${selectedConversation._id}/join`, {
				method: "POST",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to join group");
			}

			window.dispatchEvent(
				new CustomEvent("chat:conversation-restored", {
					detail: { conversation: data },
				})
			);
			setSelectedConversation(data);
			toast.success("You joined the group");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsJoiningGroup(false);
		}
	};

	const isSelectedUserOnline = selectedConversation ? onlineUsers.includes(selectedConversation._id) : false;
	const selectedUserLastSeen = selectedConversation
		? lastSeenByUser[selectedConversation._id] || selectedConversation.lastSeen
		: null;
	const selectedUserStatus = isGroupConversation
		? `${selectedConversation?.isPrivate ? "Private" : "Public"} group · ${selectedConversation?.memberCount || 1} members`
		: isSelectedUserOnline
			? "En ligne maintenant"
			: formatLastSeen(selectedUserLastSeen);
	const mobileSelectedUserStatus = [
		isSelectedUserOnline ? "En ligne" : selectedUserStatus,
		!isGroupConversation && selectedConversation?.isVerified ? "Verified" : null,
		!isGroupConversation && selectedConversation?.role === "DEVELOPER" ? "Dev" : null,
	]
		.filter(Boolean)
		.join(" · ");
	const desktopSelectedUserStatus = [
		selectedUserStatus,
		!isGroupConversation && selectedConversation?.isVerified ? "Verified account" : null,
		!isGroupConversation && selectedConversation?.role === "DEVELOPER" ? "Official developer account" : null,
	]
		.filter(Boolean)
		.join(" · ");
	const isDirectConversation = selectedConversation?.type === "DIRECT";
	const canStartDirectCall =
		Boolean(selectedConversation?._id) &&
		isDirectConversation &&
		isSelectedUserOnline &&
		isCallReady &&
		callState.phase === "idle";
	const canStartGroupCall =
		Boolean(selectedConversation?._id) &&
		isGroupConversation &&
		canReadSelectedGroup &&
		selectedConversation?.isMember !== false &&
		isCallReady &&
		callState.phase === "idle";

	return (
		<section className='flex h-full min-h-0 w-full flex-col bg-[linear-gradient(180deg,rgba(7,12,24,0.52),rgba(3,7,18,0.4))]'>
			{!selectedConversation ? (
				<NoChatSelected />
			) : (
				<>
					<div className='shrink-0 px-2 pb-2 pt-2 sm:px-3 sm:pb-3 sm:pt-3 md:px-5 md:pb-4 md:pt-4 lg:px-6'>
						<div className='flex flex-wrap items-center gap-2.5 rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(30,41,59,0.5))] px-2.5 py-2.5 shadow-[0_14px_32px_rgba(2,6,23,0.2)] sm:gap-3 sm:rounded-[28px] sm:px-3 sm:py-3 md:px-4'>
							<div className='flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3'>
								<button
									type='button'
									onClick={handleBackClick}
									className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] sm:h-11 sm:w-11'
									aria-label='Exit conversation'
									title='Exit conversation'
								>
									<IoArrowBack className='h-5 w-5' />
								</button>

								<button
									type='button'
									onClick={() => setShowUserInfo(true)}
									className='relative inline-flex shrink-0 rounded-full ring-1 ring-white/10'
									title='Open user info'
								>
									<div className='relative h-11 w-11 overflow-hidden rounded-full md:h-14 md:w-14'>
										<div
											className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
												avatarLoaded ? "opacity-0" : "opacity-100"
											}`}
										></div>
										<img
											ref={imgRef}
											src={avatarSrc}
											alt={`${selectedConversation.fullName} avatar`}
											className={`h-full w-full object-cover transition-opacity duration-200 ${
												avatarLoaded ? "opacity-100" : "opacity-0"
											}`}
											loading='eager'
											decoding='async'
											fetchpriority='high'
											onLoad={() => setAvatarLoaded(true)}
											onError={() => {
												setAvatarSrc(fallbackAvatar);
												setAvatarLoaded(true);
											}}
										/>
									</div>
									<span
										className={`absolute bottom-0 right-0 h-3.5 w-3.5 translate-x-[14%] translate-y-[14%] rounded-full border-2 border-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.45)] ${
											isSelectedUserOnline ? "bg-emerald-400" : "bg-slate-500"
										} ${isGroupConversation ? "opacity-0" : "opacity-100"}`}
									></span>
								</button>

								<div className='min-w-0 flex-1'>
									<div className='flex flex-wrap items-center gap-2'>
										<p className='truncate text-[15px] font-semibold text-slate-50 md:text-lg'>
											{selectedConversation.fullName}
										</p>
										{isGroupConversation ? (
											<span className='hidden rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 sm:inline-flex'>
												{selectedConversation.isPrivate ? "Private group" : "Group chat"}
											</span>
										) : (
											<>
												<VerifiedBadge user={selectedConversation} compact />
												<DeveloperBadge user={selectedConversation} compact className='hidden sm:inline-flex' />
												<span
													className='hidden cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300 sm:inline-flex'
													data-copy-user={selectedConversation?.username || undefined}
													title={selectedConversation?.username ? "Click to copy username" : undefined}
												>
													@{selectedConversation.username}
												</span>
											</>
										)}
									</div>
									<p className='mt-0.5 truncate pr-1 text-[11px] leading-4 text-slate-400 sm:hidden'>
										{mobileSelectedUserStatus}
									</p>
									<p className='mt-0.5 hidden truncate pr-0 text-sm leading-5 text-slate-400 sm:block'>
										{desktopSelectedUserStatus}
									</p>
								</div>
							</div>

							<div className='flex w-full items-center justify-end gap-2 pt-1 sm:w-auto sm:pt-0'>
								<div className='hidden items-center gap-2 xl:flex'>
									{capabilityCards.map(({ title }) => (
										<span
											key={title}
											className='rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300'
										>
											{title}
										</span>
									))}
								</div>

								{isDirectConversation || canReadSelectedGroup ? (
									<>
										<button
											type='button'
											onClick={() => startVideoCall(selectedConversation)}
											disabled={isDirectConversation ? !canStartDirectCall : !canStartGroupCall}
											className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-500/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-11'
											aria-label={isGroupConversation ? "Start group video call" : "Start video call"}
											title={
												!isCallReady
													? "Call connection is still loading"
													: isDirectConversation && !isSelectedUserOnline
														? "User must be online"
														: isGroupConversation && selectedConversation?.isMember === false
															? "Join the group first"
														: callState.phase !== "idle"
															? "Finish the current call first"
															: isGroupConversation
																? "Start group video call"
																: "Start video call"
											}
										>
											<HiOutlineVideoCamera className='h-5 w-5' />
										</button>
										<button
											type='button'
											onClick={() => startVoiceCall(selectedConversation)}
											disabled={isDirectConversation ? !canStartDirectCall : !canStartGroupCall}
											className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-11'
											aria-label={isGroupConversation ? "Start group voice call" : "Start voice call"}
											title={
												!isCallReady
													? "Call connection is still loading"
													: isDirectConversation && !isSelectedUserOnline
														? "User must be online"
														: isGroupConversation && selectedConversation?.isMember === false
															? "Join the group first"
														: callState.phase !== "idle"
															? "Finish the current call first"
															: isGroupConversation
																? "Start group voice call"
																: "Start voice call"
											}
										>
											<HiOutlinePhone className='h-5 w-5' />
										</button>
									</>
								) : null}

								{canReadSelectedGroup ? (
									<button
										type='button'
										onClick={() => setShowDeleteConversationModal(true)}
										className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-rose-400/25 hover:bg-rose-500/10 hover:text-rose-100 sm:h-11 sm:w-11'
										aria-label='Delete conversation'
										title='Delete conversation'
									>
										<HiOutlineTrash className='h-5 w-5' />
									</button>
								) : null}

								<button
									type='button'
									onClick={() => setShowUserInfo(true)}
									className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-sky-400/25 hover:bg-white/[0.08] sm:h-11 sm:w-11'
									aria-label='Conversation info'
									title='Conversation info'
								>
									<IoInformationCircleOutline className='h-5 w-5' />
								</button>
							</div>
						</div>
					</div>

					{canReadSelectedGroup ? (
						<>
							<Messages />
							<MessageInput />
						</>
					) : (
						<div className='flex min-h-0 flex-1 items-center justify-center px-4 py-6 md:px-6 lg:px-8'>
							<div className='w-full max-w-2xl rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(9,14,28,0.82),rgba(17,24,39,0.62))] p-6 text-center shadow-[0_18px_46px_rgba(2,6,23,0.26)] md:p-8'>
								<p className='text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/70'>Public group</p>
								<h2 className='mt-4 text-2xl font-semibold text-white md:text-3xl'>{selectedConversation.fullName}</h2>
								<p className='mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400 md:text-base'>
									Join this public group to read messages, chat with members, and receive future updates.
								</p>
								<div className='mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-left'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>About this group</p>
									<p className='mt-2 text-sm leading-7 text-slate-200'>
										{selectedConversation.bio?.trim() || "No group description yet."}
									</p>
								</div>
								<div className='mt-6 flex flex-wrap items-center justify-center gap-3'>
									<button
										type='button'
										onClick={handleJoinPublicGroup}
										className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
										disabled={isJoiningGroup}
									>
										{isJoiningGroup ? "Joining..." : "Join group"}
									</button>
									<button
										type='button'
										onClick={() => setShowUserInfo(true)}
										className='rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]'
									>
										View info
									</button>
								</div>
							</div>
						</div>
					)}
					<UserInfoModal user={selectedConversation} open={showUserInfo} onClose={() => setShowUserInfo(false)} />
					{showDeleteConversationModal
						? createPortal(
								<div className='fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/72 px-4'>
									<div className='w-full max-w-md rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-[0_32px_80px_rgba(2,6,23,0.55)]'>
										<h2 className='text-xl font-semibold text-white'>Delete conversation?</h2>
										<p className='mt-3 text-sm leading-7 text-slate-400'>
											{isGroupConversation
												? "This will remove every message in this group from your side. Other members keep their copy."
												: "This will remove every message in this chat from your side. The other user keeps their copy."}
										</p>

										<div className='mt-6 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300'>
											<span className='font-medium text-white'>{selectedConversation.fullName}</span>
											<span className='text-slate-500'> · </span>
											<span>
												{isGroupConversation
													? `${selectedConversation.memberCount || 1} members`
													: `@${selectedConversation.username}`}
											</span>
										</div>

										<div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end'>
											<button
												type='button'
												className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
												onClick={() => setShowDeleteConversationModal(false)}
											>
												Cancel
											</button>
											<button
												type='button'
												className='rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400'
												onClick={handleDeleteConversation}
												disabled={isDeletingConversation}
											>
												{isDeletingConversation ? "Deleting..." : "Delete chat"}
											</button>
										</div>
									</div>
								</div>,
								document.body
						  )
						: null}
				</>
			)}
		</section>
	);
};

export default MessageContainer;

const NoChatSelected = () => {
	const { authUser } = useAuthContext();
	const { setShowSidebar } = useConversation();

	return (
		<div className='flex h-full items-center justify-center px-4 py-6 md:px-6 lg:px-8'>
			<div className='w-full max-w-3xl rounded-[34px] border border-white/10 bg-[linear-gradient(135deg,rgba(9,14,28,0.78),rgba(17,24,39,0.56))] p-6 text-center shadow-[0_18px_46px_rgba(2,6,23,0.26)] md:p-8'>
				<div className='mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-500/15 text-sky-300'>
					<TiMessages className='h-8 w-8' />
				</div>

				<p className='mt-6 text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300/70'>Ready to chat</p>
				<h2 className='mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl'>
					Welcome back, {authUser.fullName}
				</h2>
				<p className='mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-400 md:text-base'>
					Choose a conversation to start messaging. Voice notes, emoji, quick replies, user info, and seen
					status are all already built into the chat flow.
				</p>

				<div className='mt-8 grid gap-3 md:grid-cols-3'>
					{capabilityCards.map(({ icon: Icon, title, description }) => (
						<div
							key={title}
							className='rounded-[24px] border border-white/10 bg-white/[0.035] px-4 py-4 text-left'
						>
							<div className='inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-sky-300'>
								<Icon className='h-5 w-5' />
							</div>
							<h3 className='mt-4 text-lg font-semibold text-slate-100'>{title}</h3>
							<p className='mt-2 text-sm leading-6 text-slate-400'>{description}</p>
						</div>
					))}
				</div>

				<div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
					<button
						type='button'
						onClick={() => setShowSidebar(true)}
						className='inline-flex items-center justify-center rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(14,165,233,0.25)] transition hover:bg-sky-400'
					>
						Open conversations
					</button>
					<Link
						to='/profile'
						className='inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]'
					>
						Open profile
					</Link>
				</div>
			</div>
		</div>
	);
};
