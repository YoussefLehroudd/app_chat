import { useCallback, useEffect, useRef, useState } from "react";
import useConversation from "../zustand/useConversation";
import { showRequestErrorToast } from "../utils/requestFeedback";

const MESSAGE_CACHE_PREFIX = "chat:messages:v1:";
const MESSAGE_CACHE_TTL_MS = 15000;
const MESSAGE_PAGE_LIMIT = 40;
const messageCacheMemory = new Map();

const buildConversationCacheKey = (conversation) => {
	if (!conversation?._id) return "";
	const conversationType = conversation.type === "GROUP" ? "GROUP" : "DIRECT";
	return `${conversationType}:${conversation._id}`;
};

const getMessageCacheStorageKey = (conversationCacheKey) =>
	conversationCacheKey ? `${MESSAGE_CACHE_PREFIX}${conversationCacheKey}` : "";

const normalizePageInfo = (rawPageInfo, messages) => ({
	hasMore: typeof rawPageInfo?.hasMore === "boolean" ? rawPageInfo.hasMore : messages.length >= MESSAGE_PAGE_LIMIT,
	limit:
		Number.isFinite(rawPageInfo?.limit) && Number(rawPageInfo.limit) > 0
			? Number(rawPageInfo.limit)
			: MESSAGE_PAGE_LIMIT,
	oldestMessageAt:
		typeof rawPageInfo?.oldestMessageAt === "string" ? rawPageInfo.oldestMessageAt : messages[0]?.createdAt || null,
});

const normalizeCachedEntry = (rawEntry) => {
	if (Array.isArray(rawEntry)) {
		return {
			messages: rawEntry,
			savedAt: 0,
			pageInfo: normalizePageInfo(null, rawEntry),
		};
	}

	if (!rawEntry || !Array.isArray(rawEntry.messages)) {
		return null;
	}

	const messages = rawEntry.messages;
	return {
		messages,
		savedAt: Number.isFinite(rawEntry.savedAt) ? rawEntry.savedAt : 0,
		pageInfo: normalizePageInfo(rawEntry.pageInfo, messages),
	};
};

const normalizeMessagesPayload = (payload) => {
	if (Array.isArray(payload)) {
		return {
			messages: payload,
			pageInfo: normalizePageInfo(null, payload),
		};
	}

	if (!payload || !Array.isArray(payload.messages)) {
		return {
			messages: [],
			pageInfo: normalizePageInfo(null, []),
		};
	}

	return {
		messages: payload.messages,
		pageInfo: normalizePageInfo(payload.pageInfo, payload.messages),
	};
};

const getCachedMessages = (conversationCacheKey) => {
	if (!conversationCacheKey) return null;

	const storageKey = getMessageCacheStorageKey(conversationCacheKey);
	if (storageKey) {
		try {
			const rawValue = localStorage.getItem(storageKey);
			if (rawValue) {
				const parsedValue = JSON.parse(rawValue);
				const normalizedEntry = normalizeCachedEntry(parsedValue);
				if (normalizedEntry) {
					messageCacheMemory.set(conversationCacheKey, normalizedEntry);
					return normalizedEntry;
				}
			}
		} catch {
			// Ignore storage read/parse failures.
		}
	}

	if (messageCacheMemory.has(conversationCacheKey)) {
		return normalizeCachedEntry(messageCacheMemory.get(conversationCacheKey));
	}

	return null;
};

const setCachedMessages = (conversationCacheKey, { messages, pageInfo }) => {
	if (!conversationCacheKey || !Array.isArray(messages)) return;

	const payload = {
		messages,
		savedAt: Date.now(),
		pageInfo: normalizePageInfo(pageInfo, messages),
	};

	messageCacheMemory.set(conversationCacheKey, payload);
	const storageKey = getMessageCacheStorageKey(conversationCacheKey);
	if (!storageKey) return;

	try {
		localStorage.setItem(storageKey, JSON.stringify(payload));
	} catch {
		// Ignore storage write failures.
	}
};

const mergeOlderMessages = (currentMessages, olderMessages) => {
	const safeCurrentMessages = Array.isArray(currentMessages) ? currentMessages : [];
	const safeOlderMessages = Array.isArray(olderMessages) ? olderMessages : [];

	if (safeOlderMessages.length === 0) {
		return safeCurrentMessages;
	}

	const existingIds = new Set(safeCurrentMessages.map((message) => message?._id).filter(Boolean));
	const nextOlderMessages = safeOlderMessages.filter((message) => {
		if (!message?._id) return true;
		if (existingIds.has(message._id)) return false;
		existingIds.add(message._id);
		return true;
	});

	return [...nextOlderMessages, ...safeCurrentMessages];
};

const useGetMessages = () => {
	const [loading, setLoading] = useState(false);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const [hasOlderMessages, setHasOlderMessages] = useState(false);
	const [messagesConversationKey, setMessagesConversationKey] = useState("");
	const { messages, setMessages, selectedConversation } = useConversation();
	const requestSequenceRef = useRef(0);
	const activeConversationKeyRef = useRef("");
	const messagesOwnerKeyRef = useRef("");
	const pageInfoByConversationRef = useRef(new Map());
	const loadingOlderRef = useRef(false);

	const applyMessagesForConversation = (conversationCacheKey, nextMessages, nextPageInfo = null) => {
		const normalizedMessages = Array.isArray(nextMessages) ? nextMessages : [];
		const resolvedPageInfo = normalizePageInfo(nextPageInfo, normalizedMessages);

		messagesOwnerKeyRef.current = conversationCacheKey;
		setMessagesConversationKey(conversationCacheKey);
		pageInfoByConversationRef.current.set(conversationCacheKey, resolvedPageInfo);
		setHasOlderMessages(Boolean(resolvedPageInfo.hasMore));
		setMessages(normalizedMessages);
	};

	const buildMessagesEndpoint = useCallback((conversation, { before = null } = {}) => {
		const queryParams = new URLSearchParams();
		queryParams.set("limit", String(MESSAGE_PAGE_LIMIT));
		if (before) queryParams.set("before", before);

		const basePath =
			conversation?.type === "GROUP"
				? `/api/messages/group/${conversation._id}`
				: `/api/messages/${conversation._id}`;

		return `${basePath}?${queryParams.toString()}`;
	}, []);

	useEffect(() => {
		let isCancelled = false;
		const conversationCacheKey = buildConversationCacheKey(selectedConversation);
		activeConversationKeyRef.current = conversationCacheKey;
		const requestId = ++requestSequenceRef.current;

		const getMessages = async () => {
			try {
				if (!selectedConversation?._id) {
					applyMessagesForConversation("", [], { hasMore: false, oldestMessageAt: null, limit: MESSAGE_PAGE_LIMIT });
					setLoading(false);
					return;
				}

				if (selectedConversation?.type === "GROUP" && selectedConversation?.isMember === false) {
					applyMessagesForConversation(conversationCacheKey, [], {
						hasMore: false,
						oldestMessageAt: null,
						limit: MESSAGE_PAGE_LIMIT,
					});
					setLoading(false);
					return;
				}

				const cachedEntry = getCachedMessages(conversationCacheKey);
				const cachedMessages = cachedEntry?.messages;
				const isCachedEmpty = Array.isArray(cachedMessages) && cachedMessages.length === 0;

				if (Array.isArray(cachedMessages)) {
					applyMessagesForConversation(conversationCacheKey, cachedMessages, cachedEntry?.pageInfo);
					setLoading(false);
				} else {
					applyMessagesForConversation(conversationCacheKey, [], {
						hasMore: false,
						oldestMessageAt: null,
						limit: MESSAGE_PAGE_LIMIT,
					});
					setLoading(true);
				}

				const cacheAge = cachedEntry ? Date.now() - (cachedEntry.savedAt || 0) : Number.POSITIVE_INFINITY;
				const shouldRefreshFromServer = !cachedEntry || cacheAge > MESSAGE_CACHE_TTL_MS || isCachedEmpty;

				if (!shouldRefreshFromServer) {
					return;
				}

				if (!cachedEntry || isCachedEmpty) {
					setLoading(true);
				}

				const endpoint = buildMessagesEndpoint(selectedConversation);
				const response = await fetch(endpoint);
				const data = await response.json();

				if (!response.ok || data.error) {
					throw new Error(data.error || "Failed to load messages");
				}

				if (
					isCancelled ||
					requestId !== requestSequenceRef.current ||
					activeConversationKeyRef.current !== conversationCacheKey
				) {
					return;
				}

				const normalizedPayload = normalizeMessagesPayload(data);
				setCachedMessages(conversationCacheKey, normalizedPayload);
				applyMessagesForConversation(
					conversationCacheKey,
					normalizedPayload.messages,
					normalizedPayload.pageInfo
				);
			} catch (error) {
				if (error.name !== "AbortError" && !isCancelled && requestId === requestSequenceRef.current) {
					showRequestErrorToast(error.message);
				}
			} finally {
				if (
					!isCancelled &&
					requestId === requestSequenceRef.current &&
					activeConversationKeyRef.current === conversationCacheKey
				) {
					setLoading(false);
				}
			}
		};

		void getMessages();

		return () => {
			isCancelled = true;
		};
	}, [selectedConversation?._id, selectedConversation?.type, selectedConversation?.isMember, setMessages, buildMessagesEndpoint]);

	const loadOlderMessages = useCallback(async () => {
		const currentConversation = selectedConversation;
		const conversationCacheKey = buildConversationCacheKey(currentConversation);
		if (!currentConversation?._id || !conversationCacheKey) {
			return { loaded: false };
		}

		if (loadingOlderRef.current) {
			return { loaded: false };
		}

		const currentPageInfo = pageInfoByConversationRef.current.get(conversationCacheKey);
		if (!currentPageInfo?.hasMore || !currentPageInfo.oldestMessageAt) {
			setHasOlderMessages(false);
			return { loaded: false };
		}

		loadingOlderRef.current = true;
		setLoadingOlder(true);
		const expectedConversationKey = conversationCacheKey;
		const requestId = ++requestSequenceRef.current;

		try {
			const endpoint = buildMessagesEndpoint(currentConversation, {
				before: currentPageInfo.oldestMessageAt,
			});
			const response = await fetch(endpoint);
			const data = await response.json();

			if (!response.ok || data.error) {
				throw new Error(data.error || "Failed to load older messages");
			}

			if (
				requestId !== requestSequenceRef.current ||
				activeConversationKeyRef.current !== expectedConversationKey
			) {
				return { loaded: false };
			}

			const normalizedPayload = normalizeMessagesPayload(data);
			const currentMessages = useConversation.getState().messages;
			const mergedMessages = mergeOlderMessages(currentMessages, normalizedPayload.messages);
			const mergedPageInfo = normalizePageInfo(
				{
					...normalizedPayload.pageInfo,
					oldestMessageAt: mergedMessages[0]?.createdAt || normalizedPayload.pageInfo.oldestMessageAt || null,
				},
				mergedMessages
			);

			setCachedMessages(expectedConversationKey, {
				messages: mergedMessages,
				pageInfo: mergedPageInfo,
			});
			applyMessagesForConversation(expectedConversationKey, mergedMessages, mergedPageInfo);

			return { loaded: normalizedPayload.messages.length > 0 };
		} catch (error) {
			showRequestErrorToast(error.message);
			return { loaded: false };
		} finally {
			loadingOlderRef.current = false;
			setLoadingOlder(false);
		}
	}, [buildMessagesEndpoint, selectedConversation]);

	useEffect(() => {
		const conversationCacheKey = buildConversationCacheKey(selectedConversation);
		if (!conversationCacheKey || !Array.isArray(messages)) return;
		if (messagesOwnerKeyRef.current !== conversationCacheKey) return;
		if (loading && messages.length === 0) return;

		const pageInfo = pageInfoByConversationRef.current.get(conversationCacheKey) || normalizePageInfo(null, messages);
		setCachedMessages(conversationCacheKey, { messages, pageInfo });
	}, [messages, loading, selectedConversation?._id, selectedConversation?.type]);

	return { messages, loading, loadingOlder, hasOlderMessages, loadOlderMessages, messagesConversationKey };
};

export default useGetMessages;
