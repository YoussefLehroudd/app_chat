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
		if (selectedConversation?.type === "GROUP" && selectedConversation?.isMember === false) {
			toast.error("Join the group before sending messages");
			return;
		}

		const normalizedMessage = typeof message === "string" ? message.trim() : "";
		if (!normalizedMessage && !audioBlob && !attachmentFile) {
			return;
		}

		if (audioBlob && attachmentFile) {
			toast.error("Send one upload at a time");
			return;
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

			if ((audioBlob || attachmentFile) && authUser && selectedConversation) {
				temporaryUploadUrl = URL.createObjectURL(audioBlob || attachmentFile);
				temporaryMessageId = `temp-${clientMessageId}`;
				const temporaryAttachment = attachmentFile
					? buildTemporaryAttachment(attachmentFile, temporaryUploadUrl)
					: null;

				appendMessage({
					_id: temporaryMessageId,
					conversationId: selectedConversation.conversationId || selectedConversation._id,
					conversationType: selectedConversation.type || "DIRECT",
					senderId: authUser._id,
					receiverId: selectedConversation.type === "GROUP" ? null : selectedConversation._id,
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
				selectedConversation?.type === "GROUP"
					? `/api/messages/send/group/${selectedConversation._id}`
					: `/api/messages/send/${selectedConversation._id}`;
			const res = await fetch(endpoint, {
				method: "POST",
				body: formData,
			});
			const data = await res.json();
			if (data.error) throw new Error(data.error);

			appendMessage(data);
		} catch (error) {
			if (temporaryMessageId) {
				removeMessage(temporaryMessageId);
			}
			toast.error(error.message);
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
