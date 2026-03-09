import { useEffect, useState } from "react";
import useConversation from "../zustand/useConversation";
import toast from "react-hot-toast";

const useGetMessages = () => {
	const [loading, setLoading] = useState(false);
	const { messages, setMessages, selectedConversation } = useConversation();

	useEffect(() => {
		const getMessages = async () => {
			setLoading(true);
			try {
				if (selectedConversation?.type === "GROUP" && selectedConversation?.isMember === false) {
					setMessages([]);
					return;
				}

				const endpoint =
					selectedConversation?.type === "GROUP"
						? `/api/messages/group/${selectedConversation._id}`
						: `/api/messages/${selectedConversation._id}`;
				const res = await fetch(endpoint);
				const data = await res.json();
				if (data.error) throw new Error(data.error);
				setMessages(data);
			} catch (error) {
				toast.error(error.message);
			} finally {
				setLoading(false);
			}
		};

		if (selectedConversation?._id) getMessages();
		else setMessages([]);
	}, [selectedConversation?._id, selectedConversation?.type, selectedConversation?.isMember, setMessages]);

	return { messages, loading };
};
export default useGetMessages;
