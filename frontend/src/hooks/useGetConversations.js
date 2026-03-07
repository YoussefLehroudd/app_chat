import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { preloadAvatar } from "../utils/avatar";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const STORAGE_KEY = "chat-conversations";
const CONVERSATIONS_REFRESH_EVENT = "chat:conversations-refresh";

const getCachedConversations = () => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const cacheConversations = (conversations) => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
	} catch {
		// Ignore cache write errors (e.g., storage full)
	}
};

const preloadAvatars = (conversations) => {
	for (const user of conversations) {
		if (user?.profilePic) preloadAvatar(user.profilePic, 96);
	}
};

const sortConversationsByRecentMessage = (conversations) =>
	[...conversations].sort((conversationA, conversationB) => {
		const conversationATime = conversationA.lastMessageAt ? new Date(conversationA.lastMessageAt).getTime() : 0;
		const conversationBTime = conversationB.lastMessageAt ? new Date(conversationB.lastMessageAt).getTime() : 0;
		return conversationBTime - conversationATime;
	});

const useGetConversations = () => {
	const [loading, setLoading] = useState(false);
	const [conversations, setConversations] = useState(getCachedConversations);
	const { authUser } = useAuthContext();
	const { socket } = useSocketContext();
	const { selectedConversation } = useConversation();

	useEffect(() => {
		const getConversations = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/users");
				const data = await res.json();
				if (data.error) {
					throw new Error(data.error);
				}
				const nextConversations = sortConversationsByRecentMessage(data);
				cacheConversations(nextConversations);
				preloadAvatars(nextConversations);
				setConversations(nextConversations);
			} catch (error) {
				toast.error(error.message);
			} finally {
				setLoading(false);
			}
		};

		void getConversations();

		const handleConversationsRefresh = () => {
			void getConversations();
		};

		window.addEventListener(CONVERSATIONS_REFRESH_EVENT, handleConversationsRefresh);
		return () => {
			window.removeEventListener(CONVERSATIONS_REFRESH_EVENT, handleConversationsRefresh);
		};
	}, []);

	useEffect(() => {
		if (!socket || !authUser?._id) return undefined;

		const handleConversationPreview = (newMessage) => {
			const otherUserId = newMessage.senderId === authUser._id ? newMessage.receiverId : newMessage.senderId;
			let shouldRefreshFromServer = false;

			setConversations((currentConversations) => {
				const hasMatchingConversation = currentConversations.some(
					(conversation) => conversation._id === otherUserId
				);

				if (!hasMatchingConversation) {
					shouldRefreshFromServer = true;
					return currentConversations;
				}

				const updatedConversations = currentConversations.map((conversation) =>
					conversation._id === otherUserId
						? {
								...conversation,
								lastMessage: newMessage.audio ? "Audio message" : newMessage.message?.trim() || "Message",
								lastMessageAt: newMessage.createdAt,
								unreadCount:
									newMessage.senderId !== authUser._id &&
									selectedConversation?._id !== otherUserId
										? (conversation.unreadCount || 0) + 1
										: 0,
								hasUnread:
									newMessage.senderId !== authUser._id &&
									selectedConversation?._id !== otherUserId,
						  }
						: conversation
				);

				const sortedConversations = sortConversationsByRecentMessage(updatedConversations);
				cacheConversations(sortedConversations);
				return sortedConversations;
			});

			if (shouldRefreshFromServer) {
				window.dispatchEvent(new Event(CONVERSATIONS_REFRESH_EVENT));
			}
		};

		socket.on("newMessage", handleConversationPreview);
		return () => {
			socket.off("newMessage", handleConversationPreview);
		};
	}, [socket, authUser?._id, selectedConversation?._id]);

	useEffect(() => {
		if (!selectedConversation?._id) return;

		setConversations((currentConversations) => {
			let hasChanges = false;
			const updatedConversations = currentConversations.map((conversation) => {
				if (conversation._id !== selectedConversation._id || !conversation.unreadCount) {
					return conversation;
				}

				hasChanges = true;
				return {
					...conversation,
					unreadCount: 0,
					hasUnread: false,
				};
			});

			if (!hasChanges) {
				return currentConversations;
			}

			cacheConversations(updatedConversations);
			return updatedConversations;
		});
	}, [selectedConversation?._id]);

	return { loading, conversations };
};
export default useGetConversations;
