import { useEffect } from "react";
import { useAuthContext } from "../context/AuthContext";
import useConversation from "../zustand/useConversation";

const useMarkAsSeen = () => {
	const { selectedConversation, messages } = useConversation();
	const { authUser } = useAuthContext();

	useEffect(() => {
		const markAsSeen = async () => {
			if (!selectedConversation?._id || !authUser?._id) return;

			// Check if there are any unseen messages from the other user
			const hasUnseenMessages = messages.some(
				(msg) =>
					msg.senderId === selectedConversation._id &&
					msg.receiverId === authUser._id &&
					!msg.isSeen
			);

			if (hasUnseenMessages) {
				try {
					await fetch(`/api/messages/seen/${selectedConversation._id}`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
					});
				} catch (error) {
					console.log("Error marking messages as seen:", error);
				}
			}
		};

		// Mark messages as seen when conversation is opened or messages change
		markAsSeen();
	}, [selectedConversation, messages]);
};

export default useMarkAsSeen;
