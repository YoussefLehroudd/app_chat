import { useCallback, useEffect, useRef, useState } from "react";
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

const buildConversationKey = (conversation) => {
	if (!conversation?._id) return "";
	const conversationType = conversation.type === "GROUP" ? "GROUP" : "DIRECT";
	return `${conversationType}:${conversation._id}`;
};

const Messages = () => {
	const { messages, loading, loadingOlder, hasOlderMessages, loadOlderMessages, messagesConversationKey } =
		useGetMessages();
	const { selectedConversation, isRecording, isTyping, setIsRecording } = useConversation();
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
	const initialScrollDoneRef = useRef(false);
	const pendingPrependRestoreRef = useRef(null);
	const previousBoundariesRef = useRef({
		firstId: null,
		lastId: null,
		count: 0,
	});
	const selectedConversationKey = buildConversationKey(selectedConversation);

	useEffect(() => {
		initialScrollDoneRef.current = false;
		pendingPrependRestoreRef.current = null;
		previousBoundariesRef.current = {
			firstId: null,
			lastId: null,
			count: 0,
		};
		setIsRecording(false);
	}, [selectedConversation?._id, setIsRecording]);

	const scrollToBottom = useCallback((behavior = "auto") => {
		lastMessageRef.current?.scrollIntoView({ behavior });
	}, []);

	const loadOlderAtTop = useCallback(async () => {
		if (loading || loadingOlder || !hasOlderMessages) return;
		const container = scrollContainerRef.current;
		if (!container) return;

		pendingPrependRestoreRef.current = {
			prevHeight: container.scrollHeight,
			prevTop: container.scrollTop,
		};

		const result = await loadOlderMessages();
		if (!result?.loaded) {
			pendingPrependRestoreRef.current = null;
		}
	}, [hasOlderMessages, loadOlderMessages, loading, loadingOlder]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return undefined;

		let isFramePending = false;
		const handleScroll = () => {
			if (isFramePending) return;

			isFramePending = true;
			requestAnimationFrame(() => {
				isFramePending = false;
				if (container.scrollTop <= 80) {
					void loadOlderAtTop();
				}
			});
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			container.removeEventListener("scroll", handleScroll);
		};
	}, [loadOlderAtTop]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		if (!selectedConversationKey || messagesConversationKey !== selectedConversationKey) return;

		const currentFirstId = messages[0]?._id || null;
		const currentLastId = messages[messages.length - 1]?._id || null;
		const currentCount = messages.length;
		const previous = previousBoundariesRef.current;

		if (!initialScrollDoneRef.current) {
			if (currentCount === 0) {
				// Wait for the first real batch before locking initial scroll state.
				if (loading) {
					return;
				}

				initialScrollDoneRef.current = true;
				previousBoundariesRef.current = {
					firstId: currentFirstId,
					lastId: currentLastId,
					count: currentCount,
				};
				return;
			}

			initialScrollDoneRef.current = true;
			requestAnimationFrame(() => {
				scrollToBottom("auto");
			});
			previousBoundariesRef.current = {
				firstId: currentFirstId,
				lastId: currentLastId,
				count: currentCount,
			};
			return;
		}

		if (pendingPrependRestoreRef.current) {
			const { prevHeight, prevTop } = pendingPrependRestoreRef.current;
			pendingPrependRestoreRef.current = null;
			requestAnimationFrame(() => {
				container.scrollTop = container.scrollHeight - prevHeight + prevTop;
			});
			previousBoundariesRef.current = {
				firstId: currentFirstId,
				lastId: currentLastId,
				count: currentCount,
			};
			return;
		}

		const appendedMessages =
			currentCount >= previous.count &&
			currentFirstId === previous.firstId &&
			currentLastId !== previous.lastId;
		const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
		const isNearBottom = distanceFromBottom <= 120;

		if (appendedMessages && isNearBottom) {
			requestAnimationFrame(() => {
				scrollToBottom("smooth");
			});
		}

		previousBoundariesRef.current = {
			firstId: currentFirstId,
			lastId: currentLastId,
			count: currentCount,
		};
	}, [messages, messagesConversationKey, scrollToBottom, selectedConversationKey]);

	useEffect(() => {
		if (!isTyping) return;
		const container = scrollContainerRef.current;
		if (!container) return;
		const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
		if (distanceFromBottom <= 120) {
			requestAnimationFrame(() => {
				scrollToBottom("smooth");
			});
		}
	}, [isTyping, scrollToBottom]);

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

	const handleJumpToMessage = useCallback(async (targetMessageId) => {
		if (!targetMessageId) return;

		const focusMessage = () => {
			const targetElement = document.getElementById(`message-${targetMessageId}`);
			if (!targetElement) return false;

			targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
			setHighlightedMessageId(targetMessageId);

			if (highlightTimeoutRef.current) {
				clearTimeout(highlightTimeoutRef.current);
			}

			highlightTimeoutRef.current = setTimeout(() => {
				setHighlightedMessageId(null);
			}, 1800);

			return true;
		};

		if (messages.some((message) => message._id === targetMessageId)) {
			if (!focusMessage()) {
				toast.error("Original message not found");
			}
			return;
		}

		while (true) {
			const result = await loadOlderMessages();
			const stateMessages = useConversation.getState().messages;

			if (stateMessages.some((message) => message._id === targetMessageId)) {
				requestAnimationFrame(() => {
					if (!focusMessage()) {
						toast.error("Original message not found");
					}
				});
				return;
			}

			if (!result?.loaded) {
				break;
			}
		}

		toast.error("Original message not found");
	}, [loadOlderMessages, messages]);

	useEffect(() => {
		const handleJumpRequest = (event) => {
			void handleJumpToMessage(event.detail?.messageId);
		};

		window.addEventListener("chat:jump-to-message", handleJumpRequest);
		return () => {
			window.removeEventListener("chat:jump-to-message", handleJumpRequest);
		};
	}, [handleJumpToMessage]);

	return (
		<div className='min-h-0 flex-1 px-2 sm:px-3 md:px-5 lg:px-6'>
			<div className='h-full overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(2,6,23,0.34),rgba(15,23,42,0.18))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-[30px]'>
				<div
					ref={scrollContainerRef}
					className='custom-scrollbar chat-scrollbar messages-scroll-region h-full overflow-x-hidden overflow-y-auto px-2.5 py-3 sm:px-3 sm:py-4 md:px-5'
				>
					<div className='space-y-2 pr-1 md:space-y-3'>
						{loadingOlder ? (
							<div className='flex items-center justify-center py-1'>
								<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-300'>
									Loading older messages...
								</span>
							</div>
						) : null}

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
								<div className='w-full max-w-lg rounded-[30px] border border-dashed border-white/10 bg-slate-950/30 px-6 py-8 text-center'>
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

						{isTyping || isRecording ? (
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
									{selectedConversation?.fullName} {isRecording ? "is recording" : "is typing"}
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
