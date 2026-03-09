import { useEffect } from "react";
import { useAuthContext } from "../context/AuthContext";
import useConversation from "../zustand/useConversation";

const useMarkAsSeen = () => {
	const { selectedConversation, messages } = useConversation();
	const { authUser } = useAuthContext();

	useEffect(() => {
		const markAsSeen = async () => {
			if (!selectedConversation?._id || !authUser?._id) return;
			if (selectedConversation.type === "GROUP" && selectedConversation.isMember === false) return;

			const hasUnseenMessages =
				selectedConversation.type === "GROUP"
					? messages.some((message) => message.senderId !== authUser._id)
					: messages.some(
							(msg) =>
								msg.senderId === selectedConversation._id &&
								msg.receiverId === authUser._id &&
								!msg.isSeen
					  );

			if (hasUnseenMessages) {
				try {
					const endpoint =
						selectedConversation.type === "GROUP"
							? `/api/messages/seen/group/${selectedConversation._id}`
							: `/api/messages/seen/${selectedConversation._id}`;
					await fetch(endpoint, {
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
	}, [selectedConversation, messages, authUser?._id]);
};

export default useMarkAsSeen;
