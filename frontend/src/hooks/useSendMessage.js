import { useState } from "react";
import useConversation from "../zustand/useConversation";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";
import { buildTemporaryAttachment, getAttachmentLabel } from "../utils/messageAttachments";

const createClientMessageId = () => {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const MESSAGE_CACHE_PREFIX = "chat:messages:v1:";
const MESSAGE_PAGE_LIMIT = 40;

const buildConversationCacheKey = (conversation) => {
	if (!conversation?._id) return "";
	const conversationType = conversation.type === "GROUP" ? "GROUP" : "DIRECT";
	return `${MESSAGE_CACHE_PREFIX}${conversationType}:${conversation._id}`;
};

const isSameConversation = (conversationA, conversationB) => {
	if (!conversationA?._id || !conversationB?._id) return false;
	return conversationA._id === conversationB._id && conversationA.type === conversationB.type;
};

const normalizeCachePayload = (payload) => {
	const normalizePageInfo = (rawPageInfo, messages) => ({
		hasMore:
			typeof rawPageInfo?.hasMore === "boolean" ? rawPageInfo.hasMore : (Array.isArray(messages) ? messages.length >= MESSAGE_PAGE_LIMIT : false),
		limit:
			Number.isFinite(rawPageInfo?.limit) && Number(rawPageInfo.limit) > 0
				? Number(rawPageInfo.limit)
				: MESSAGE_PAGE_LIMIT,
		oldestMessageAt:
			typeof rawPageInfo?.oldestMessageAt === "string"
				? rawPageInfo.oldestMessageAt
				: Array.isArray(messages) && messages[0]?.createdAt
					? messages[0].createdAt
					: null,
	});

	if (Array.isArray(payload)) {
		return {
			messages: payload,
			savedAt: 0,
			pageInfo: normalizePageInfo(null, payload),
		};
	}

	if (!payload || !Array.isArray(payload.messages)) {
		return {
			messages: [],
			savedAt: 0,
			pageInfo: normalizePageInfo(null, []),
		};
	}

	return {
		messages: payload.messages,
		savedAt: Number.isFinite(payload.savedAt) ? payload.savedAt : 0,
		pageInfo: normalizePageInfo(payload.pageInfo, payload.messages),
	};
};

const upsertCachedMessage = (messages, incomingMessage) => {
	if (!incomingMessage) return messages;
	const nextMessages = Array.isArray(messages) ? [...messages] : [];

	if (incomingMessage.clientMessageId) {
		const indexByClientId = nextMessages.findIndex(
			(message) => message.clientMessageId && message.clientMessageId === incomingMessage.clientMessageId
		);
		if (indexByClientId !== -1) {
			nextMessages[indexByClientId] = {
				...nextMessages[indexByClientId],
				...incomingMessage,
				isPending: false,
			};
			return nextMessages;
		}
	}

	if (incomingMessage._id) {
		const indexByMessageId = nextMessages.findIndex((message) => message._id === incomingMessage._id);
		if (indexByMessageId !== -1) {
			nextMessages[indexByMessageId] = {
				...nextMessages[indexByMessageId],
				...incomingMessage,
			};
			return nextMessages;
		}
	}

	nextMessages.push(incomingMessage);
	return nextMessages;
};

const updateConversationMessageCache = (conversation, incomingMessage) => {
	const cacheKey = buildConversationCacheKey(conversation);
	if (!cacheKey || !incomingMessage) return;

	try {
		const rawPayload = localStorage.getItem(cacheKey);
		const parsedPayload = rawPayload ? JSON.parse(rawPayload) : null;
		const normalizedPayload = normalizeCachePayload(parsedPayload);
		const nextMessages = upsertCachedMessage(normalizedPayload.messages, incomingMessage);

		localStorage.setItem(
			cacheKey,
			JSON.stringify({
				messages: nextMessages,
				savedAt: Date.now(),
				pageInfo: {
					...normalizedPayload.pageInfo,
					oldestMessageAt: nextMessages[0]?.createdAt || normalizedPayload.pageInfo?.oldestMessageAt || null,
				},
			})
		);
	} catch {
		// Ignore localStorage cache errors.
	}
};

const useSendMessage = () => {
	const [loading, setLoading] = useState(false);
	const { authUser } = useAuthContext();
	const { appendMessage, removeMessage, selectedConversation } = useConversation();

	const sendMessage = async ({
		message = "",
		audioBlob = null,
		attachmentFile = null,
		repliedMessageId = null,
		audioDurationSeconds = null,
	} = {}) => {
		const conversationAtSend = selectedConversation;
		if (!conversationAtSend?._id) {
			return { ok: false };
		}

		if (conversationAtSend?.type === "GROUP" && conversationAtSend?.isMember === false) {
			toast.error("Join the group before sending messages");
			return { ok: false };
		}

		const normalizedMessage = typeof message === "string" ? message.trim() : "";
		if (!normalizedMessage && !audioBlob && !attachmentFile) {
			return { ok: false };
		}

		if (audioBlob && attachmentFile) {
			toast.error("Send one upload at a time");
			return { ok: false };
		}

		setLoading(true);
		let temporaryUploadUrl = null;
		let temporaryMessageId = null;
		const clientMessageId = audioBlob || attachmentFile ? createClientMessageId() : null;

		try {
			const formData = new FormData();
			if (normalizedMessage) formData.append("message", normalizedMessage);
			if (audioBlob) {
				const audioFileName = audioBlob.type?.includes("ogg") ? "audio.ogg" : "audio.webm";
				formData.append("audio", audioBlob, audioFileName);
				formData.append("clientMessageId", clientMessageId);
				if (Number.isFinite(audioDurationSeconds) && audioDurationSeconds >= 0) {
					formData.append("audioDurationSeconds", String(audioDurationSeconds));
				}
			}
			if (attachmentFile) {
				formData.append("attachment", attachmentFile, attachmentFile.name || "attachment");
				formData.append("clientMessageId", clientMessageId);
			}
			if (repliedMessageId) formData.append("repliedMessageId", repliedMessageId);

			if ((audioBlob || attachmentFile) && authUser && conversationAtSend) {
				temporaryUploadUrl = URL.createObjectURL(audioBlob || attachmentFile);
				temporaryMessageId = `temp-${clientMessageId}`;
				const temporaryAttachment = attachmentFile
					? buildTemporaryAttachment(attachmentFile, temporaryUploadUrl)
					: null;

				appendMessage({
					_id: temporaryMessageId,
					conversationId: conversationAtSend.conversationId || conversationAtSend._id,
					conversationType: conversationAtSend.type || "DIRECT",
					senderId: authUser._id,
					receiverId: conversationAtSend.type === "GROUP" ? null : conversationAtSend._id,
					message: normalizedMessage || null,
					audio: audioBlob ? temporaryUploadUrl : null,
					audioDurationSeconds:
						audioBlob && Number.isFinite(audioDurationSeconds) && audioDurationSeconds >= 0
							? audioDurationSeconds
							: null,
					attachment: temporaryAttachment,
					repliedMessageId: null,
					isSeen: false,
					deletedFor: [],
					sender: authUser,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					clientMessageId,
					previewText: normalizedMessage || (temporaryAttachment ? getAttachmentLabel(temporaryAttachment) : "Audio message"),
					isPending: true,
				});
			}

			const endpoint =
				conversationAtSend?.type === "GROUP"
					? `/api/messages/send/group/${conversationAtSend._id}`
					: `/api/messages/send/${conversationAtSend._id}`;
			const res = await fetch(endpoint, {
				method: "POST",
				body: formData,
			});
			const data = await res.json();
			if (!res.ok || data.error) throw new Error(data.error || "Failed to send message");

			updateConversationMessageCache(conversationAtSend, data);

			const activeConversation = useConversation.getState().selectedConversation;
			if (isSameConversation(activeConversation, conversationAtSend)) {
				appendMessage(data);
			}

			return { ok: true, data };
		} catch (error) {
			if (temporaryMessageId) {
				removeMessage(temporaryMessageId);
			}
			toast.error(error.message);
			return { ok: false, error };
		} finally {
			if (temporaryUploadUrl) {
				URL.revokeObjectURL(temporaryUploadUrl);
			}
			setLoading(false);
		}
	};

	return { sendMessage, loading };
};
export default useSendMessage;
