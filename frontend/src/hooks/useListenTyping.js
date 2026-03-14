import { useEffect } from "react";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const useListenTyping = () => {
	const { socket } = useSocketContext();
	const { setIsRecording, setIsTyping, selectedConversation } = useConversation();

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

		const handleUserRecordingStart = (userId) => {
			if (selectedConversation?.type === "DIRECT" && selectedConversation?._id === userId) {
				setIsRecording(true);
				setIsTyping(false);
			}
		};

		const handleUserRecordingStop = (userId) => {
			if (selectedConversation?.type === "DIRECT" && selectedConversation?._id === userId) {
				setIsRecording(false);
			}
		};

		socket.on("userTyping", handleUserTyping);
		socket.on("userStopTyping", handleUserStopTyping);
		socket.on("userRecordingStart", handleUserRecordingStart);
		socket.on("userRecordingStop", handleUserRecordingStop);

		return () => {
			socket.off("userTyping", handleUserTyping);
			socket.off("userStopTyping", handleUserStopTyping);
			socket.off("userRecordingStart", handleUserRecordingStart);
			socket.off("userRecordingStop", handleUserRecordingStop);
		};
	}, [socket, setIsRecording, setIsTyping, selectedConversation]);
};

export default useListenTyping;
