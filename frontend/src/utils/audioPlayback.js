const CHAT_AUDIO_CONTROL_EVENT = "chat-audio-control";

const stopAllChatAudio = ({ exceptId = null, reset = false } = {}) => {
	if (typeof window === "undefined") return;

	window.dispatchEvent(
		new CustomEvent(CHAT_AUDIO_CONTROL_EVENT, {
			detail: {
				type: "stop-all",
				exceptId,
				reset,
			},
		})
	);
};

export { CHAT_AUDIO_CONTROL_EVENT, stopAllChatAudio };
