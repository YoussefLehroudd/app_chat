import { useState, useEffect, useRef } from "react";
import useGetMessages from "../../hooks/useGetMessages";
import MessageSkeleton from "../skeletons/MessageSkeleton";
import Message from "./Message";
import useListenMessages from "../../hooks/useListenMessages";
import useListenTyping from "../../hooks/useListenTyping";
import useMarkAsSeen from "../../hooks/useMarkAsSeen";
import useListenMessagesSeen from "../../hooks/useListenMessagesSeen";
import useConversation from "../../zustand/useConversation";

const Messages = () => {
	const { messages, loading } = useGetMessages();
	const { selectedConversation, isTyping } = useConversation();
	const [contextMenuMessageId, setContextMenuMessageId] = useState(null);

	useListenMessages();
	useListenTyping();
	useMarkAsSeen();
	useListenMessagesSeen();
	const lastMessageRef = useRef();

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
		} else {
			document.removeEventListener("click", handleClickOutside);
		}
		return () => {
			document.removeEventListener("click", handleClickOutside);
		};
	}, [contextMenuMessageId]);

	return (
		<div className='px-3 md:px-4 flex-1 overflow-auto'>
			{!loading &&
				messages.length > 0 &&
				messages.map((message) => {
					// Simulate repliedMessage by finding message with id = message.repliedMessageId
					const repliedMessage = message.repliedMessageId
						? messages.find((m) => m._id === message.repliedMessageId)
						: null;
					return (
						<div key={message._id} ref={lastMessageRef}>
							<Message
								message={message}
								repliedMessage={repliedMessage}
								onDeleteMessage={useConversation.getState().removeMessage}
								contextMenuMessageId={contextMenuMessageId}
								setContextMenuMessageId={setContextMenuMessageId}
							/>
						</div>
					);
				})}

			{loading && [...Array(3)].map((_, idx) => <MessageSkeleton key={idx} />)}
			{!loading && messages.length === 0 && (
				<p className='text-center text-sm md:text-base text-gray-300'>Send a message to start the conversation</p>
			)}
			
			{isTyping && (
				<div className='flex gap-2 items-center px-3 md:px-4 py-2'>
					<div className='avatar'>
						<div className='w-8 md:w-10 rounded-full'>
							<img src={selectedConversation?.profilePic} alt='user avatar' />
						</div>
					</div>
					<div className='text-xs md:text-sm text-gray-400 italic'>
						{selectedConversation?.fullName} is typing
						<span className='loading loading-dots loading-xs ml-1'></span>
					</div>
				</div>
			)}
		</div>
	);
};
export default Messages;

// STARTER CODE SNIPPET
// import Message from "./Message";

// const Messages = () => {
// 	return (
// 		<div className='px-4 flex-1 overflow-auto'>
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 			<Message />
// 		</div>
// 	);
// };
// export default Messages;
