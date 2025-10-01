import { useState, useEffect, useRef } from "react";
import { BsSend } from "react-icons/bs";
import useSendMessage from "../../hooks/useSendMessage";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";

const MessageInput = () => {
	const [message, setMessage] = useState("");
	const { loading, sendMessage } = useSendMessage();
	const { selectedConversation } = useConversation();
	const { socket } = useSocketContext();
	const typingTimeoutRef = useRef(null);
	const textareaRef = useRef(null);

	const handleTyping = () => {
		if (!selectedConversation) return;

		// Emit typing event
		socket?.emit("typing", selectedConversation._id);

		// Clear previous timeout
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}

		// Set timeout to emit stop typing after 2 seconds of inactivity
		typingTimeoutRef.current = setTimeout(() => {
			socket?.emit("stopTyping", selectedConversation._id);
		}, 2000);
	};

	const adjustTextareaHeight = () => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			// Set max height to 120px (about 5 lines)
			const newHeight = Math.min(textarea.scrollHeight, 120);
			textarea.style.height = `${newHeight}px`;
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!message.trim()) return;

		// Emit stop typing when sending message
		socket?.emit("stopTyping", selectedConversation._id);
		
		// Clear timeout
		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}

		await sendMessage(message);
		setMessage("");
		
		// Reset textarea height after sending
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	};

	const handleChange = (e) => {
		setMessage(e.target.value);
		handleTyping();
		adjustTextareaHeight();
	};

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
		};
	}, []);

	return (
		<form className='px-3 md:px-4 my-2 md:my-3' onSubmit={handleSubmit}>
			<div className='w-full relative flex items-end'>
				<textarea
					ref={textareaRef}
					rows='1'
					className='border text-sm md:text-base rounded-lg block w-full p-2.5 md:p-3 bg-gray-700 border-gray-600 text-white pr-12 resize-none overflow-y-auto'
					placeholder='Send a message'
					value={message}
					onChange={handleChange}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							handleSubmit(e);
						}
					}}
					style={{ minHeight: '44px', maxHeight: '120px' }}
				/>
				<button 
					type='submit' 
					className='absolute bottom-2 md:bottom-3 end-3 md:end-4 flex items-center justify-center hover:text-sky-400 transition-colors'
					disabled={loading}
				>
					{loading ? <div className='loading loading-spinner'></div> : <BsSend className='w-5 h-5 md:w-6 md:h-6' />}
				</button>
			</div>
		</form>
	);
};
export default MessageInput;
