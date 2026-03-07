import { useEffect } from "react";

import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

import notificationSound from "../assets/sounds/notification.mp3";

const useListenMessages = () => {
	const { socket } = useSocketContext();
	const { appendMessage, selectedConversation } = useConversation();

	useEffect(() => {
		if (!socket) return undefined;

		const handleNewMessage = (newMessage) => {
			const isForSelectedConversation =
				selectedConversation?._id &&
				(newMessage.senderId === selectedConversation._id ||
					newMessage.receiverId === selectedConversation._id);

			if (!isForSelectedConversation) {
				return;
			}

			newMessage.shouldShake = true;
			const sound = new Audio(notificationSound);
			sound.play();
			appendMessage(newMessage);
		};

		socket.on("newMessage", handleNewMessage);

		return () => socket.off("newMessage", handleNewMessage);
	}, [socket, appendMessage, selectedConversation?._id]);
};
export default useListenMessages;
