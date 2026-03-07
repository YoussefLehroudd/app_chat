import { create } from "zustand";

const useConversation = create((set) => ({
	selectedConversation: null,
	setSelectedConversation: (selectedConversation) => set({ selectedConversation }),
	messages: [],
	setMessages: (messages) => set({ messages }),
	appendMessage: (message) =>
		set((state) => ({
			messages: (() => {
				if (message?.clientMessageId) {
					const matchedTemporaryMessageIndex = state.messages.findIndex(
						(currentMessage) => currentMessage.clientMessageId === message.clientMessageId
					);

					if (matchedTemporaryMessageIndex !== -1) {
						const nextMessages = [...state.messages];
						nextMessages[matchedTemporaryMessageIndex] = {
							...nextMessages[matchedTemporaryMessageIndex],
							...message,
							isPending: false,
						};
						return nextMessages;
					}
				}

				return state.messages.some((currentMessage) => currentMessage._id === message._id)
					? state.messages
					: [...state.messages, message];
			})(),
		})),
	removeMessage: (messageId) =>
		set((state) => ({
			messages: state.messages.filter((msg) => msg._id !== messageId),
		})),
	restoreMessage: (message, index) =>
		set((state) => {
			if (!message || state.messages.some((currentMessage) => currentMessage._id === message._id)) {
				return state;
			}

			const nextMessages = [...state.messages];
			const insertionIndex =
				Number.isInteger(index) && index >= 0
					? Math.min(index, nextMessages.length)
					: nextMessages.length;

			nextMessages.splice(insertionIndex, 0, message);
			return { messages: nextMessages };
		}),
	markMessagesSeen: (messageIds) =>
		set((state) => ({
			messages: state.messages.map((message) =>
				messageIds.includes(message._id) ? { ...message, isSeen: true } : message
			),
		})),
	isTyping: false,
	setIsTyping: (isTyping) => set({ isTyping }),
	showSidebar: true,
	setShowSidebar: (showSidebar) => set({ showSidebar }),
	repliedMessage: null,
	setRepliedMessage: (repliedMessage) => set({ repliedMessage }),
}));

export default useConversation;
