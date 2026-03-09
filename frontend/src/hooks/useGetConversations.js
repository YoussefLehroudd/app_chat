import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { preloadAvatar } from "../utils/avatar";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const STORAGE_KEY = "chat-conversations";
const CONVERSATIONS_REFRESH_EVENT = "chat:conversations-refresh";
const CONVERSATION_REMOVED_EVENT = "chat:conversation-removed";
const CONVERSATION_RESTORED_EVENT = "chat:conversation-restored";

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

const removeConversationFromList = (conversations, conversationId) =>
	conversations.filter((conversation) => conversation._id !== conversationId);

const restoreConversationInList = (conversations, conversation) =>
	sortConversationsByRecentMessage([
		conversation,
		...conversations.filter((currentConversation) => currentConversation._id !== conversation._id),
	]);

const applyUserUpdateToConversation = (conversation, userUpdate) => {
	if (!conversation?._id || !userUpdate?._id) return conversation;

	if (conversation.type === "GROUP") {
		return {
			...conversation,
			members: Array.isArray(conversation.members)
				? conversation.members.map((member) => (member?._id === userUpdate._id ? { ...member, ...userUpdate } : member))
				: conversation.members,
		};
	}

	return conversation._id === userUpdate._id ? { ...conversation, ...userUpdate } : conversation;
};

const useGetConversations = () => {
	const [loading, setLoading] = useState(false);
	const [conversations, setConversations] = useState(getCachedConversations);
	const { authUser } = useAuthContext();
	const { socket } = useSocketContext();
	const { selectedConversation, setSelectedConversation, setMessages, setShowSidebar } = useConversation();

	useEffect(() => {
		const getConversations = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/conversations");
				const data = await res.json();
				if (data.error) {
					throw new Error(data.error);
				}
				const nextConversations = sortConversationsByRecentMessage(data);
				cacheConversations(nextConversations);
				preloadAvatars(nextConversations);
				setConversations(nextConversations);

				if (selectedConversation?._id) {
					const refreshedSelectedConversation = nextConversations.find(
						(conversation) => conversation._id === selectedConversation._id
					);

					if (refreshedSelectedConversation) {
						setSelectedConversation(refreshedSelectedConversation);
					} else {
						setSelectedConversation(null);
						setMessages([]);
						setShowSidebar(true);
					}
				}
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

		const handleConversationRemoved = (event) => {
			const conversationId = event.detail?.conversationId;
			if (!conversationId) return;

			if (selectedConversation?._id === conversationId) {
				setSelectedConversation(null);
				setMessages([]);
				setShowSidebar(true);
			}

			setConversations((currentConversations) => {
				const nextConversations = removeConversationFromList(currentConversations, conversationId);
				cacheConversations(nextConversations);
				return nextConversations;
			});
		};

		const handleConversationRestored = (event) => {
			const conversation = event.detail?.conversation;
			if (!conversation?._id) return;

			if (selectedConversation?._id === conversation._id) {
				setSelectedConversation(conversation);
			}

			setConversations((currentConversations) => {
				const nextConversations = restoreConversationInList(currentConversations, conversation);
				cacheConversations(nextConversations);
				preloadAvatars([conversation]);
				return nextConversations;
			});
		};

		window.addEventListener(CONVERSATIONS_REFRESH_EVENT, handleConversationsRefresh);
		window.addEventListener(CONVERSATION_REMOVED_EVENT, handleConversationRemoved);
		window.addEventListener(CONVERSATION_RESTORED_EVENT, handleConversationRestored);
		return () => {
			window.removeEventListener(CONVERSATIONS_REFRESH_EVENT, handleConversationsRefresh);
			window.removeEventListener(CONVERSATION_REMOVED_EVENT, handleConversationRemoved);
			window.removeEventListener(CONVERSATION_RESTORED_EVENT, handleConversationRestored);
		};
	}, [selectedConversation?._id, setMessages, setSelectedConversation, setShowSidebar]);

	useEffect(() => {
		if (!socket || !authUser?._id) return undefined;

		const handleConversationPreview = (newMessage) => {
			const targetConversationId =
				newMessage.conversationType === "GROUP"
					? newMessage.conversationId
					: newMessage.senderId === authUser._id
						? newMessage.receiverId
						: newMessage.senderId;
			let shouldRefreshFromServer = false;

			setConversations((currentConversations) => {
				const hasMatchingConversation = currentConversations.some(
					(conversation) => conversation._id === targetConversationId
				);

				if (!hasMatchingConversation) {
					shouldRefreshFromServer = true;
					return currentConversations;
				}

				const updatedConversations = currentConversations.map((conversation) =>
					conversation._id === targetConversationId
						? {
								...conversation,
								lastMessage: newMessage.isSystem
									? newMessage.systemText || newMessage.message || "Group update"
									: newMessage.isCallMessage
										? newMessage.callInfo?.previewText || newMessage.previewText || "Call"
									: newMessage.isGroupInvite
										? "Group invitation"
									: newMessage.audio
										? "Audio message"
										: newMessage.attachment
											? newMessage.previewText || newMessage.attachment.fileName || "Attachment"
											: newMessage.message?.trim() || newMessage.previewText || "Message",
								lastMessageAt: newMessage.createdAt,
								unreadCount:
									newMessage.senderId !== authUser._id &&
									selectedConversation?._id !== targetConversationId
										? (conversation.unreadCount || 0) + 1
										: 0,
								hasUnread:
									newMessage.senderId !== authUser._id &&
									selectedConversation?._id !== targetConversationId,
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

		const handleConversationUpsert = (conversation) => {
			if (!conversation?._id) return;

			if (selectedConversation?._id === conversation._id) {
				setSelectedConversation(conversation);
			}

			setConversations((currentConversations) => {
				const nextConversations = restoreConversationInList(currentConversations, conversation);
				cacheConversations(nextConversations);
				preloadAvatars([conversation]);
				return nextConversations;
			});
		};

		const handleSocketConversationRemoved = ({ conversationId }) => {
			if (!conversationId) return;

			if (selectedConversation?._id === conversationId) {
				setSelectedConversation(null);
				setMessages([]);
				setShowSidebar(true);
			}

			setConversations((currentConversations) => {
				const nextConversations = removeConversationFromList(currentConversations, conversationId);
				cacheConversations(nextConversations);
				return nextConversations;
			});
		};

		const handlePublicGroupsChanged = () => {
			window.dispatchEvent(new Event(CONVERSATIONS_REFRESH_EVENT));
		};

		const handlePublicUserUpdated = (updatedUser) => {
			if (!updatedUser?._id) return;

			setConversations((currentConversations) => {
				const nextConversations = currentConversations.map((conversation) =>
					applyUserUpdateToConversation(conversation, updatedUser)
				);
				cacheConversations(nextConversations);
				preloadAvatars(nextConversations);
				return nextConversations;
			});
		};

		socket.on("newMessage", handleConversationPreview);
		socket.on("conversationUpserted", handleConversationUpsert);
		socket.on("conversationRemoved", handleSocketConversationRemoved);
		socket.on("publicGroupsChanged", handlePublicGroupsChanged);
		socket.on("publicUserUpdated", handlePublicUserUpdated);
		return () => {
			socket.off("newMessage", handleConversationPreview);
			socket.off("conversationUpserted", handleConversationUpsert);
			socket.off("conversationRemoved", handleSocketConversationRemoved);
			socket.off("publicGroupsChanged", handlePublicGroupsChanged);
			socket.off("publicUserUpdated", handlePublicUserUpdated);
		};
	}, [
		socket,
		authUser?._id,
		selectedConversation?._id,
		setMessages,
		setSelectedConversation,
		setShowSidebar,
	]);

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
