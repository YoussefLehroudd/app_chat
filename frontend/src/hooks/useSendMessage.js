import { useState } from "react";
import useConversation from "../zustand/useConversation";
import toast from "react-hot-toast";

const useSendMessage = () => {
	const [loading, setLoading] = useState(false);
	const { messages, setMessages, selectedConversation } = useConversation();

	const sendMessage = async (message, audioBlob = null, repliedMessageId = null) => {
		setLoading(true);
		try {
			const formData = new FormData();
			if (message) formData.append("message", message);
			if (audioBlob) formData.append("audio", audioBlob, "audio.webm");
			if (repliedMessageId) formData.append("repliedMessageId", repliedMessageId);

			const res = await fetch(`/api/messages/send/${selectedConversation._id}`, {
				method: "POST",
				body: formData,
			});
			const data = await res.json();
			if (data.error) throw new Error(data.error);

			// Add repliedMessageId to the new message object for frontend simulation
			// if (repliedMessageId) {
			// 	data.repliedMessageId = repliedMessageId;
			// }

			setMessages([...messages, data]);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setLoading(false);
		}
	};

	return { sendMessage, loading };
};
export default useSendMessage;
