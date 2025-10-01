import { create } from "zustand";

const useConversation = create((set) => ({
	selectedConversation: null,
	setSelectedConversation: (selectedConversation) => set({ selectedConversation }),
	messages: [],
	setMessages: (messages) => set({ messages }),
	isTyping: false,
	setIsTyping: (isTyping) => set({ isTyping }),
	showSidebar: true,
	setShowSidebar: (showSidebar) => set({ showSidebar }),
}));

export default useConversation;
