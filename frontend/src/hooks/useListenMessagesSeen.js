import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenMessagesSeen = () => {
	const { socket } = useSocketContext();
	const { markMessagesSeen, selectedConversation } = useConversation();

	useEffect(() => {
		if (!socket) return undefined;

		const handleMessagesSeen = ({ conversationId, messageIds }) => {
			// Only update if we're viewing the conversation where messages were seen
			if (selectedConversation?._id === conversationId) {
				markMessagesSeen(messageIds);
			}
		};

		socket.on("messagesSeen", handleMessagesSeen);

		return () => socket.off("messagesSeen", handleMessagesSeen);
	}, [socket, markMessagesSeen, selectedConversation]);
};

export default useListenMessagesSeen;
