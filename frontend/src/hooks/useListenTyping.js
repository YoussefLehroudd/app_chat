import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenTyping = () => {
	const { socket } = useSocketContext();
	const { setIsTyping, selectedConversation } = useConversation();

	useEffect(() => {
		if (!socket) return undefined;

		const handleUserTyping = (userId) => {
			// Only show typing indicator if it's from the selected conversation
			if (selectedConversation?.type === "DIRECT" && selectedConversation?._id === userId) {
				setIsTyping(true);
			}
		};

		const handleUserStopTyping = (userId) => {
			// Only hide typing indicator if it's from the selected conversation
			if (selectedConversation?.type === "DIRECT" && selectedConversation?._id === userId) {
				setIsTyping(false);
			}
		};

		socket.on("userTyping", handleUserTyping);
		socket.on("userStopTyping", handleUserStopTyping);

		return () => {
			socket.off("userTyping", handleUserTyping);
			socket.off("userStopTyping", handleUserStopTyping);
		};
	}, [socket, setIsTyping, selectedConversation]);
};

export default useListenTyping;
