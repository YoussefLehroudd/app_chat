import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenTyping = () => {
	const { socket } = useSocketContext();
	const { setIsTyping, selectedConversation } = useConversation();

	useEffect(() => {
		socket?.on("userTyping", (userId) => {
			// Only show typing indicator if it's from the selected conversation
			if (selectedConversation?._id === userId) {
				setIsTyping(true);
			}
		});

		socket?.on("userStopTyping", (userId) => {
			// Only hide typing indicator if it's from the selected conversation
			if (selectedConversation?._id === userId) {
				setIsTyping(false);
			}
		});

		return () => {
			socket?.off("userTyping");
			socket?.off("userStopTyping");
		};
	}, [socket, setIsTyping, selectedConversation]);
};

export default useListenTyping;
