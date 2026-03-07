import { useState } from "react";
import useConversation from "../zustand/useConversation";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";

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

	const sendMessage = async (message, audioBlob = null, repliedMessageId = null, audioDurationSeconds = null) => {
		setLoading(true);
		let temporaryAudioUrl = null;
		let temporaryMessageId = null;
		const clientMessageId = audioBlob ? createClientMessageId() : null;

		try {
			const formData = new FormData();
			if (message) formData.append("message", message);
			if (audioBlob) {
				const audioFileName = audioBlob.type?.includes("ogg") ? "audio.ogg" : "audio.webm";
				formData.append("audio", audioBlob, audioFileName);
				formData.append("clientMessageId", clientMessageId);
				if (Number.isFinite(audioDurationSeconds) && audioDurationSeconds >= 0) {
					formData.append("audioDurationSeconds", String(audioDurationSeconds));
				}
			}
			if (repliedMessageId) formData.append("repliedMessageId", repliedMessageId);

			if (audioBlob && authUser && selectedConversation) {
				temporaryAudioUrl = URL.createObjectURL(audioBlob);
				temporaryMessageId = `temp-${clientMessageId}`;

				appendMessage({
					_id: temporaryMessageId,
					senderId: authUser._id,
					receiverId: selectedConversation._id,
					message: null,
					audio: temporaryAudioUrl,
					audioDurationSeconds:
						Number.isFinite(audioDurationSeconds) && audioDurationSeconds >= 0 ? audioDurationSeconds : null,
					repliedMessageId: null,
					isSeen: false,
					deletedFor: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					clientMessageId,
					isPending: true,
				});
			}

			const res = await fetch(`/api/messages/send/${selectedConversation._id}`, {
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
			if (temporaryAudioUrl) {
				URL.revokeObjectURL(temporaryAudioUrl);
			}
			setLoading(false);
		}
	};

	return { sendMessage, loading };
};
export default useSendMessage;
