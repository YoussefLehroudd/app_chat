import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { preloadAvatar } from "../utils/avatar";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";
import useConversation from "../zustand/useConversation";

const STORAGE_KEY_PREFIX = "chat-conversations";
const LEGACY_STORAGE_KEY = "chat-conversations";
const CONVERSATIONS_REFRESH_EVENT = "chat:conversations-refresh";
const CONVERSATION_REMOVED_EVENT = "chat:conversation-removed";
const CONVERSATION_RESTORED_EVENT = "chat:conversation-restored";
const CONVERSATIONS_MIN_REFRESH_MS = 3500;
const STORY_INTERACTION_MESSAGE_PREFIX = "__CHAT_STORY_INTERACTION__:";

const getStorageKey = (userId) => `${STORAGE_KEY_PREFIX}:${userId || "anonymous"}`;
const getUserId = (user) => user?._id || user?.id || null;
const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const getStoryInteractionPreview = (value) => {
	if (typeof value !== "string" || !value.startsWith(STORY_INTERACTION_MESSAGE_PREFIX)) {
		return null;
	}

	try {
		const parsedValue = JSON.parse(value.slice(STORY_INTERACTION_MESSAGE_PREFIX.length));
		const interactionType =
			typeof parsedValue?.interactionType === "string" ? parsedValue.interactionType.toUpperCase() : null;
		const previewText = normalizeText(parsedValue?.previewText);

		if (previewText) return previewText;
		if (interactionType === "COMMENT") return "Replied to your story";
		if (interactionType === "REACTION") return "Reacted to your story";
		return "Story interaction";
	} catch {
		return "Story interaction";
	}
};

const normalizeConversationPreview = (conversation) => {
	if (!conversation || typeof conversation !== "object") return conversation;
	const storyPreview = getStoryInteractionPreview(conversation.lastMessage);
	if (!storyPreview) return conversation;

	return {
		...conversation,
		lastMessage: storyPreview,
	};
};

const normalizeConversationList = (conversations) =>
	Array.isArray(conversations) ? conversations.map((conversation) => normalizeConversationPreview(conversation)) : [];

const readConversationsFromStorage = (storageKey) => {
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return null;
	}
};

const getCachedConversations = (userId) => {
	const scopedConversations = readConversationsFromStorage(getStorageKey(userId));
	const legacyConversations = readConversationsFromStorage(LEGACY_STORAGE_KEY);

	if (Array.isArray(scopedConversations) && scopedConversations.length > 0) {
		return normalizeConversationList(scopedConversations);
	}

	if (Array.isArray(legacyConversations) && legacyConversations.length > 0) {
		return normalizeConversationList(legacyConversations);
	}

	return normalizeConversationList(scopedConversations ?? legacyConversations ?? []);
};

const cacheConversations = (userId, conversations) => {
	try {
		const normalizedConversations = normalizeConversationList(conversations);
		localStorage.setItem(getStorageKey(userId), JSON.stringify(normalizedConversations));
		localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(normalizedConversations));
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
	conversations.filter((conversation) => {
		if (!conversationId) return true;

		if (conversation?.type === "GROUP") {
			return conversation._id !== conversationId && conversation.conversationId !== conversationId;
		}

		if (conversation?.type === "DIRECT") {
			// Keep direct contacts visible even if a direct conversation history is cleared.
			if (!conversation.conversationId) return true;
			return conversation.conversationId !== conversationId;
		}

		return conversation._id !== conversationId;
	});

const restoreConversationInList = (conversations, conversation) =>
	sortConversationsByRecentMessage([
		normalizeConversationPreview(conversation),
		...conversations.filter((currentConversation) => currentConversation._id !== conversation._id),
	]);

const applyUserUpdateToConversation = (conversation, userUpdate) => {
	const updatedUserId = getUserId(userUpdate);
	if (!conversation?._id || !updatedUserId) return conversation;

	if (conversation.type === "GROUP") {
		return {
			...conversation,
			members: Array.isArray(conversation.members)
				? conversation.members.map((member) => (member?._id === updatedUserId ? { ...member, ...userUpdate } : member))
				: conversation.members,
		};
	}

	return conversation._id === updatedUserId ? { ...conversation, ...userUpdate } : conversation;
};

const toDirectSidebarItem = (user) => ({
	...user,
	conversationId: user?.conversationId ?? null,
	type: "DIRECT",
	isGroup: false,
	isPrivate: false,
	memberLimit: null,
	memberCount: 2,
	groupRole: null,
	members: [],
});

const mergeDirectUsersWithConversations = (conversations, users) => {
	const existingDirectUserIds = new Set(
		conversations
			.filter((conversation) => conversation?.type === "DIRECT" && !conversation?.isGroup && conversation?._id)
			.map((conversation) => conversation._id)
	);

	const missingDirectItems = users
		.map((user) => {
			const userId = getUserId(user);
			return userId ? { ...user, _id: userId, id: userId } : null;
		})
		.filter((user) => user && !existingDirectUserIds.has(user._id))
		.map(toDirectSidebarItem);

	return normalizeConversationList(sortConversationsByRecentMessage([...conversations, ...missingDirectItems]));
};

const fetchSelectableUsers = async (signal) => {
	const selectableUsersResponse = await fetch("/api/users/selectable", { signal });
	if (!selectableUsersResponse.ok) return [];

	const selectableUsersData = await selectableUsersResponse.json();
	return Array.isArray(selectableUsersData) ? selectableUsersData : [];
};

const useGetConversations = () => {
	const { authUser } = useAuthContext();
	const storageUserId = getUserId(authUser);
	const authUserId = storageUserId;
	const [loading, setLoading] = useState(false);
	const [hasFetchError, setHasFetchError] = useState(false);
	const [conversations, setConversations] = useState(() => getCachedConversations(storageUserId));
	const { socket } = useSocketContext();
	const { selectedConversation, setSelectedConversation, setMessages, setShowSidebar } = useConversation();
	const selectedConversationRef = useRef(selectedConversation);
	const conversationsRef = useRef(conversations);
	const inFlightRef = useRef(false);
	const queuedRefreshRef = useRef(false);
	const requestSequenceRef = useRef(0);
	const lastFetchedAtRef = useRef(0);
	const abortControllerRef = useRef(null);
	const isMountedRef = useRef(false);

	useEffect(() => {
		selectedConversationRef.current = selectedConversation;
	}, [selectedConversation]);

	useEffect(() => {
		conversationsRef.current = conversations;
	}, [conversations]);

	useEffect(() => {
		const cachedConversations = getCachedConversations(storageUserId);
		setConversations(cachedConversations);
		conversationsRef.current = cachedConversations;
		lastFetchedAtRef.current = 0;
		setHasFetchError(false);
	}, [storageUserId]);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			abortControllerRef.current?.abort();
		};
	}, []);

	const getConversations = useCallback(
		async ({ force = false } = {}) => {
			if (!isMountedRef.current || !storageUserId) return;

			const hasLocalConversations = conversationsRef.current.length > 0;
			const isWithinCooldown = Date.now() - lastFetchedAtRef.current < CONVERSATIONS_MIN_REFRESH_MS;

			if (!force && hasLocalConversations && isWithinCooldown) {
				return;
			}

			if (inFlightRef.current) {
				if (force) {
					queuedRefreshRef.current = true;
				}
				return;
			}

			inFlightRef.current = true;
			const requestId = ++requestSequenceRef.current;
			const controller = new AbortController();
			abortControllerRef.current?.abort();
			abortControllerRef.current = controller;

			setLoading(true);

			try {
				const [conversationsResponse, selectableUsersResponse] = await Promise.all([
					fetch("/api/conversations", { signal: controller.signal }),
					fetchSelectableUsers(controller.signal),
				]);

				const selectableUsers = Array.isArray(selectableUsersResponse) ? selectableUsersResponse : [];

				let normalizedConversations = [];
				if (conversationsResponse.ok) {
					const conversationsData = await conversationsResponse.json();
					if (conversationsData?.error) {
						throw new Error(conversationsData.error || "Failed to load conversations");
					}
					normalizedConversations = Array.isArray(conversationsData) ? conversationsData : [];
				} else {
					const conversationsErrorPayload = await conversationsResponse.json().catch(() => null);
					if (selectableUsers.length === 0) {
						throw new Error(conversationsErrorPayload?.error || "Failed to load conversations");
					}
				}

				if (!isMountedRef.current || requestId !== requestSequenceRef.current) {
					return;
				}

				const nextConversations = normalizeConversationList(
					mergeDirectUsersWithConversations(normalizedConversations, selectableUsers)
				);
				lastFetchedAtRef.current = Date.now();
				cacheConversations(storageUserId, nextConversations);
				preloadAvatars(nextConversations);
				setConversations(nextConversations);
				setHasFetchError(false);

				const currentSelectedConversation = selectedConversationRef.current;
				if (currentSelectedConversation?._id) {
					const refreshedSelectedConversation = nextConversations.find(
						(conversation) => conversation._id === currentSelectedConversation._id
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
				if (error.name === "AbortError") {
					return;
				}

				if (isMountedRef.current && requestId === requestSequenceRef.current) {
					setHasFetchError(true);
					toast.error(error.message);
				}
			} finally {
				if (requestId === requestSequenceRef.current) {
					inFlightRef.current = false;
					if (isMountedRef.current) {
						setLoading(false);
					}

					if (queuedRefreshRef.current) {
						queuedRefreshRef.current = false;
						void getConversations({ force: true });
					}
				}
			}
		},
		[setMessages, setSelectedConversation, setShowSidebar, storageUserId]
	);

	useEffect(() => {
		void getConversations();

		const handleConversationsRefresh = () => {
			void getConversations({ force: true });
		};

		const handleConversationRemoved = (event) => {
			const conversationId = event.detail?.conversationId;
			if (!conversationId) return;

			if (selectedConversationRef.current?._id === conversationId) {
				setSelectedConversation(null);
				setMessages([]);
				setShowSidebar(true);
			}

				setConversations((currentConversations) => {
					const nextConversations = removeConversationFromList(currentConversations, conversationId);
					cacheConversations(storageUserId, nextConversations);
					return nextConversations;
				});
			};

		const handleConversationRestored = (event) => {
			const conversation = event.detail?.conversation;
			if (!conversation?._id) return;
			const normalizedConversation = normalizeConversationPreview(conversation);

			if (selectedConversationRef.current?._id === conversation._id) {
				setSelectedConversation(normalizedConversation);
			}

				setConversations((currentConversations) => {
					const nextConversations = restoreConversationInList(currentConversations, normalizedConversation);
					cacheConversations(storageUserId, nextConversations);
					preloadAvatars([normalizedConversation]);
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
	}, [getConversations, setMessages, setSelectedConversation, setShowSidebar, storageUserId]);

	useEffect(() => {
		if (!storageUserId || !hasFetchError || loading) return undefined;

		const retryTimeout = setTimeout(() => {
			void getConversations({ force: true });
		}, 2200);

		return () => clearTimeout(retryTimeout);
	}, [getConversations, hasFetchError, loading, storageUserId]);

	useEffect(() => {
		if (!storageUserId || conversations.length > 0) return undefined;

		let isCancelled = false;

		const hydrateConversationsFromSelectableUsers = async () => {
			try {
				const selectableUsers = await fetchSelectableUsers();
				if (!Array.isArray(selectableUsers) || selectableUsers.length === 0 || isCancelled) {
					return;
				}

				setConversations((currentConversations) => {
					if (currentConversations.length > 0) return currentConversations;

					const nextConversations = mergeDirectUsersWithConversations(currentConversations, selectableUsers);
					cacheConversations(storageUserId, nextConversations);
					preloadAvatars(nextConversations);
					return nextConversations;
				});
			} catch {
				// Ignore hydration errors, regular fetch cycle keeps retrying.
			}
		};

		void hydrateConversationsFromSelectableUsers();
		const hydrationInterval = setInterval(() => {
			void hydrateConversationsFromSelectableUsers();
		}, 4500);

		return () => {
			isCancelled = true;
			clearInterval(hydrationInterval);
		};
	}, [conversations.length, storageUserId]);

	useEffect(() => {
		if (!socket || !authUserId) return undefined;

		const handleConversationPreview = (newMessage) => {
				const targetConversationId =
					newMessage.conversationType === "GROUP"
						? newMessage.conversationId
						: newMessage.senderId === authUserId
							? newMessage.receiverId
							: newMessage.senderId;
			let shouldRefreshFromServer = false;

			setConversations((currentConversations) => {
				const selectedConversationId = selectedConversationRef.current?._id;
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
									: newMessage.isStoryInteraction
										? newMessage.previewText || "Story interaction"
									: newMessage.isGroupInvite
										? "Group invitation"
									: newMessage.audio
										? "Audio message"
										: newMessage.attachment
											? newMessage.previewText || newMessage.attachment.fileName || "Attachment"
											: newMessage.message?.trim() || newMessage.previewText || "Message",
								lastMessageAt: newMessage.createdAt,
								unreadCount:
									newMessage.senderId !== authUserId && selectedConversationId !== targetConversationId
										? (conversation.unreadCount || 0) + 1
										: 0,
								hasUnread: newMessage.senderId !== authUserId && selectedConversationId !== targetConversationId,
						  }
						: conversation
				);

					const sortedConversations = sortConversationsByRecentMessage(updatedConversations);
					cacheConversations(storageUserId, sortedConversations);
					return sortedConversations;
				});

			if (shouldRefreshFromServer) {
				void getConversations({ force: true });
			}
		};

		const handleConversationUpsert = (conversation) => {
			if (!conversation?._id) return;
			const normalizedConversation = normalizeConversationPreview(conversation);

			if (selectedConversationRef.current?._id === conversation._id) {
				setSelectedConversation(normalizedConversation);
			}

				setConversations((currentConversations) => {
					const nextConversations = restoreConversationInList(currentConversations, normalizedConversation);
					cacheConversations(storageUserId, nextConversations);
					preloadAvatars([normalizedConversation]);
					return nextConversations;
				});
		};

		const handleSocketConversationRemoved = ({ conversationId }) => {
			if (!conversationId) return;

			if (selectedConversationRef.current?._id === conversationId) {
				setSelectedConversation(null);
				setMessages([]);
				setShowSidebar(true);
			}

				setConversations((currentConversations) => {
					const nextConversations = removeConversationFromList(currentConversations, conversationId);
					cacheConversations(storageUserId, nextConversations);
					return nextConversations;
				});
		};

		const handlePublicGroupsChanged = () => {
			void getConversations({ force: true });
		};

		const handlePublicUserUpdated = (updatedUser) => {
			const updatedUserId = getUserId(updatedUser);
			if (!updatedUserId || updatedUserId === authUserId) return;

			const normalizedUser = { ...updatedUser, _id: updatedUserId, id: updatedUserId };
			setConversations((currentConversations) => {
				const hasDirectConversation = currentConversations.some(
					(conversation) =>
						conversation?.type === "DIRECT" &&
						!conversation?.isGroup &&
						getUserId(conversation) === updatedUserId
				);

				const nextConversations = hasDirectConversation
					? currentConversations.map((conversation) => applyUserUpdateToConversation(conversation, normalizedUser))
					: sortConversationsByRecentMessage([...currentConversations, toDirectSidebarItem(normalizedUser)]);

				cacheConversations(storageUserId, nextConversations);
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
		authUserId,
		storageUserId,
		getConversations,
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

			cacheConversations(storageUserId, updatedConversations);
			return updatedConversations;
		});
	}, [selectedConversation?._id, storageUserId]);

	return { loading, conversations };
};
export default useGetConversations;
