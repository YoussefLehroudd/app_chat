import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenMessagesSeen = () => {
	const { socket } = useSocketContext();
	const { messages, setMessages, selectedConversation } = useConversation();

	useEffect(() => {
		socket?.on("messagesSeen", ({ conversationId, messageIds }) => {
			// Only update if we're viewing the conversation where messages were seen
			if (selectedConversation?._id === conversationId) {
				const updatedMessages = messages.map((msg) => {
					if (messageIds.includes(msg._id)) {
						return { ...msg, isSeen: true };
					}
					return msg;
				});
				setMessages(updatedMessages);
			}
		});

		return () => socket?.off("messagesSeen");
	}, [socket, messages, setMessages, selectedConversation]);
};

export default useListenMessagesSeen;
