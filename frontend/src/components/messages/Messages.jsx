import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { BsReply } from "react-icons/bs";
import { HiOutlineFaceSmile, HiOutlineMicrophone } from "react-icons/hi2";
import useGetMessages from "../../hooks/useGetMessages";
import MessageSkeleton from "../skeletons/MessageSkeleton";
import Message from "./Message";
import useListenMessages from "../../hooks/useListenMessages";
import useListenTyping from "../../hooks/useListenTyping";
import useMarkAsSeen from "../../hooks/useMarkAsSeen";
import useListenMessagesSeen from "../../hooks/useListenMessagesSeen";
import useConversation from "../../zustand/useConversation";
import getDefaultAvatar from "../../utils/defaultAvatar";

const emptyStateTips = [
	{ icon: HiOutlineMicrophone, label: "Send voice notes" },
	{ icon: HiOutlineFaceSmile, label: "Use emoji in the composer" },
	{ icon: BsReply, label: "Right-click to reply or copy" },
];

const Messages = () => {
	const { messages, loading } = useGetMessages();
	const { selectedConversation, isTyping } = useConversation();
	const [contextMenuMessageId, setContextMenuMessageId] = useState(null);
	const [typingAvatarSrc, setTypingAvatarSrc] = useState(null);
	const [highlightedMessageId, setHighlightedMessageId] = useState(null);

	useListenMessages();
	useListenTyping();
	useMarkAsSeen();
	useListenMessagesSeen();

	const lastMessageRef = useRef();
	const scrollContainerRef = useRef();
	const highlightTimeoutRef = useRef(null);

	useEffect(() => {
		setTimeout(() => {
			lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
		}, 100);
	}, [messages, isTyping]);

	useEffect(() => {
		const handleClickOutside = () => {
			setContextMenuMessageId(null);
		};

		if (contextMenuMessageId !== null) {
			document.addEventListener("click", handleClickOutside);
		}

		return () => {
			document.removeEventListener("click", handleClickOutside);
		};
	}, [contextMenuMessageId]);

	useEffect(() => {
		if (!selectedConversation) {
			setTypingAvatarSrc(null);
			return;
		}

		const fallbackAvatar = getDefaultAvatar(selectedConversation.gender);
		setTypingAvatarSrc(selectedConversation.profilePic || fallbackAvatar);
	}, [selectedConversation]);

	useEffect(() => {
		return () => {
			if (highlightTimeoutRef.current) {
				clearTimeout(highlightTimeoutRef.current);
			}
		};
	}, []);

	const handleJumpToMessage = (targetMessageId) => {
		if (!targetMessageId) return;

		const targetMessageExists = messages.some((message) => message._id === targetMessageId);
		if (!targetMessageExists) {
			toast.error("Original message not found");
			return;
		}

		const targetElement = document.getElementById(`message-${targetMessageId}`);
		if (!targetElement) {
			toast.error("Original message not found");
			return;
		}

		targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
		setHighlightedMessageId(targetMessageId);

		if (highlightTimeoutRef.current) {
			clearTimeout(highlightTimeoutRef.current);
		}

		highlightTimeoutRef.current = setTimeout(() => {
			setHighlightedMessageId(null);
		}, 1800);
	};

	return (
		<div className='min-h-0 flex-1 px-2 sm:px-3 md:px-5 lg:px-6'>
			<div className='h-full overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(2,6,23,0.34),rgba(15,23,42,0.18))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-[30px]'>
				<div
					ref={scrollContainerRef}
					className='custom-scrollbar chat-scrollbar h-full overflow-x-hidden overflow-y-auto px-2.5 py-3 sm:px-3 sm:py-4 md:px-5'
				>
					<div className='space-y-2 pr-1 md:space-y-3'>
						{!loading &&
							messages.length > 0 &&
							messages.map((message) => {
								const repliedMessage = message.repliedMessageId;

								return (
									<div key={message._id} ref={lastMessageRef}>
										<Message
											message={message}
											repliedMessage={repliedMessage}
											onDeleteMessage={useConversation.getState().removeMessage}
											onJumpToMessage={handleJumpToMessage}
											isHighlighted={highlightedMessageId === message._id}
											contextMenuMessageId={contextMenuMessageId}
											setContextMenuMessageId={setContextMenuMessageId}
											scrollContainerRef={scrollContainerRef}
										/>
									</div>
								);
							})}

						{loading && [...Array(3)].map((_, idx) => <MessageSkeleton key={idx} />)}

						{!loading && messages.length === 0 ? (
							<div className='flex min-h-[340px] items-center justify-center py-4'>
								<div className='w-full max-w-lg rounded-[30px] border border-dashed border-white/10 bg-slate-950/30 px-6 py-8 text-center backdrop-blur-xl'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300/65'>
										New conversation
									</p>
									<h3 className='mt-4 text-2xl font-semibold text-white'>No messages yet</h3>
									<p className='mt-3 text-sm leading-7 text-slate-400'>
										Start the conversation with a text, an emoji, or a voice note. Everything you need is in the
										composer below.
									</p>

									<div className='mt-6 grid gap-3 text-left sm:grid-cols-3'>
										{emptyStateTips.map(({ icon: Icon, label }) => (
											<div
												key={label}
												className='rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4'
											>
												<div className='inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-300'>
													<Icon className='h-5 w-5' />
												</div>
												<p className='mt-4 text-sm font-medium leading-6 text-slate-200'>{label}</p>
											</div>
										))}
									</div>
								</div>
							</div>
						) : null}

						{isTyping ? (
							<div className='flex items-center gap-3 px-1 py-1'>
								<div className='avatar shrink-0'>
									<div className='w-10 rounded-full ring-1 ring-white/10'>
										<img
											src={typingAvatarSrc || getDefaultAvatar(selectedConversation?.gender)}
											alt='user avatar'
											onError={() => setTypingAvatarSrc(getDefaultAvatar(selectedConversation?.gender))}
										/>
									</div>
								</div>
								<div className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300'>
									{selectedConversation?.fullName} is typing
									<span className='loading loading-dots loading-xs ml-2'></span>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export default Messages;
