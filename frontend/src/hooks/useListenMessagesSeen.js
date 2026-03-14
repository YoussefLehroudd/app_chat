import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenMessagesSeen = () => {
	const { socket } = useSocketContext();
	const { markMessagesDelivered, markMessagesSeen, selectedConversation } = useConversation();

	useEffect(() => {
		if (!socket) return undefined;

		const handleMessagesSeen = ({ conversationId, messageIds }) => {
			// Only update if we're viewing the conversation where messages were seen
			if (selectedConversation?.type === "DIRECT" && selectedConversation?._id === conversationId) {
				markMessagesSeen(messageIds);
			}
		};

		const handleMessagesDelivered = ({ conversationId, messageIds, deliveredAt }) => {
			if (selectedConversation?.type === "DIRECT" && selectedConversation?._id === conversationId) {
				markMessagesDelivered(messageIds, deliveredAt);
			}
		};

		socket.on("messagesSeen", handleMessagesSeen);
		socket.on("messagesDelivered", handleMessagesDelivered);

		return () => {
			socket.off("messagesSeen", handleMessagesSeen);
			socket.off("messagesDelivered", handleMessagesDelivered);
		};
	}, [socket, markMessagesDelivered, markMessagesSeen, selectedConversation]);
};

export default useListenMessagesSeen;
