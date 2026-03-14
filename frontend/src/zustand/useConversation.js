import { create } from "zustand";

const useConversation = create((set) => ({
	selectedConversation: null,
	setSelectedConversation: (selectedConversation) => set({ selectedConversation }),
	updateSelectedConversation: (updates) =>
		set((state) => ({
			selectedConversation: state.selectedConversation
				? {
						...state.selectedConversation,
						...(typeof updates === "function" ? updates(state.selectedConversation) : updates),
				  }
				: null,
		})),
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
	updateMessage: (messageId, nextMessage) =>
		set((state) => ({
			messages: state.messages.map((message) =>
				message._id === messageId
					? typeof nextMessage === "function"
						? nextMessage(message)
						: { ...message, ...nextMessage }
					: message
			),
		})),
	applyUserUpdate: (userUpdate) =>
		set((state) => {
			if (!userUpdate?._id) {
				return state;
			}

			const mergeUser = (user) => (user?._id === userUpdate._id ? { ...user, ...userUpdate } : user);

			const nextSelectedConversation = state.selectedConversation
				? state.selectedConversation.type === "GROUP"
					? {
							...state.selectedConversation,
							members: Array.isArray(state.selectedConversation.members)
								? state.selectedConversation.members.map((member) => mergeUser(member))
								: state.selectedConversation.members,
					  }
					: state.selectedConversation._id === userUpdate._id
						? {
								...state.selectedConversation,
								...userUpdate,
						  }
						: state.selectedConversation
				: null;

			const nextMessages = state.messages.map((message) => ({
				...message,
				sender: mergeUser(message.sender),
				repliedMessageId: message.repliedMessageId
					? {
							...message.repliedMessageId,
							sender: mergeUser(message.repliedMessageId.sender),
					  }
					: message.repliedMessageId,
			}));

			return {
				selectedConversation: nextSelectedConversation,
				messages: nextMessages,
			};
		}),
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
	markMessagesDelivered: (messageIds, deliveredAt) =>
		set((state) => ({
			messages: state.messages.map((message) =>
				messageIds.includes(message._id)
					? { ...message, deliveredAt: deliveredAt || message.deliveredAt || new Date().toISOString() }
					: message
			),
		})),
	isTyping: false,
	setIsTyping: (isTyping) => set({ isTyping }),
	isRecording: false,
	setIsRecording: (isRecording) => set({ isRecording }),
	showSidebar: true,
	setShowSidebar: (showSidebar) => set({ showSidebar }),
	repliedMessage: null,
	setRepliedMessage: (repliedMessage) => set({ repliedMessage }),
}));

export default useConversation;
