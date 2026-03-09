import { useEffect } from "react";

import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

import notificationSound from "../assets/sounds/notification.mp3";

const useListenMessages = () => {
	const { socket } = useSocketContext();
	const { appendMessage, selectedConversation, updateMessage } = useConversation();

	useEffect(() => {
		if (!socket) return undefined;

		const handleNewMessage = (newMessage) => {
			const isForSelectedConversation =
				selectedConversation?.type === "GROUP"
					? selectedConversation._id === newMessage.conversationId
					: selectedConversation?._id &&
						(newMessage.senderId === selectedConversation._id ||
							newMessage.receiverId === selectedConversation._id);

			if (!isForSelectedConversation) {
				return;
			}

			newMessage.shouldShake = true;
			if (!newMessage.isCallMessage) {
				const sound = new Audio(notificationSound);
				sound.play();
			}
			appendMessage(newMessage);
		};

		const handleMessageUpdated = (updatedMessage) => {
			const isForSelectedConversation =
				selectedConversation?.type === "GROUP"
					? selectedConversation._id === updatedMessage.conversationId
					: selectedConversation?._id &&
						(updatedMessage.senderId === selectedConversation._id ||
							updatedMessage.receiverId === selectedConversation._id);

			if (!isForSelectedConversation) {
				return;
			}

			updateMessage(updatedMessage._id, updatedMessage);
		};

		socket.on("newMessage", handleNewMessage);
		socket.on("messageUpdated", handleMessageUpdated);

		return () => {
			socket.off("newMessage", handleNewMessage);
			socket.off("messageUpdated", handleMessageUpdated);
		};
	}, [socket, appendMessage, selectedConversation?._id, selectedConversation?.type, updateMessage]);
};
export default useListenMessages;
