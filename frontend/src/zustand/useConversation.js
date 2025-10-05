import { create } from "zustand";

const useConversation = create((set) => ({
	selectedConversation: null,
	setSelectedConversation: (selectedConversation) => set({ selectedConversation }),
	messages: [],
	setMessages: (messages) => set({ messages }),
	removeMessage: (messageId) =>
		set((state) => ({
			messages: state.messages.filter((msg) => msg._id !== messageId),
		})),
	isTyping: false,
	setIsTyping: (isTyping) => set({ isTyping }),
	showSidebar: true,
	setShowSidebar: (showSidebar) => set({ showSidebar }),
	repliedMessage: null,
	setRepliedMessage: (repliedMessage) => set({ repliedMessage }),
}));

export default useConversation;
