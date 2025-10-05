import { useState, useEffect, useRef } from "react";
import { BsSend, BsMic } from "react-icons/bs";
import useSendMessage from "../../hooks/useSendMessage";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";

const MessageInput = () => {
	const [message, setMessage] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const { loading, sendMessage } = useSendMessage();
	const { selectedConversation, repliedMessage, setRepliedMessage } = useConversation();
	const { socket } = useSocketContext();
	const typingTimeoutRef = useRef(null);
	const textareaRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const audioChunksRef = useRef([]);

	const handleTyping = () => {
		if (!selectedConversation) return;

		socket?.emit("typing", selectedConversation._id);

		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}

		typingTimeoutRef.current = setTimeout(() => {
			socket?.emit("stopTyping", selectedConversation._id);
		}, 2000);
	};

	const adjustTextareaHeight = () => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			const newHeight = Math.min(textarea.scrollHeight, 120);
			textarea.style.height = `${newHeight}px`;
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!message.trim()) return;

		socket?.emit("stopTyping", selectedConversation._id);

		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}

		await sendMessage(message, null, repliedMessage ? repliedMessage._id : null);
		setMessage("");
		if (repliedMessage) {
			setRepliedMessage(null);
		}

		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
		}
	};

	const handleChange = (e) => {
		setMessage(e.target.value);
		handleTyping();
		adjustTextareaHeight();
	};

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorderRef.current = new MediaRecorder(stream);
			audioChunksRef.current = [];

			mediaRecorderRef.current.ondataavailable = (event) => {
				audioChunksRef.current.push(event.data);
			};

			mediaRecorderRef.current.onstop = async () => {
				const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
				await sendMessage("", audioBlob);
				stream.getTracks().forEach(track => track.stop());
			};

			mediaRecorderRef.current.start();
			setIsRecording(true);
		} catch (error) {
			console.error("Error starting recording:", error);
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current && isRecording) {
			mediaRecorderRef.current.stop();
			setIsRecording(false);
		}
	};

	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
		};
	}, []);

	return (
		<form className='px-3 md:px-4 my-2 md:my-3' onSubmit={handleSubmit}>
			<div className='w-full relative flex flex-col'>
				{repliedMessage && (
					<div className="bg-gray-700 rounded-t-lg p-2 mb-1 relative">
						<div className="text-xs text-gray-300 mb-1">Replying to</div>
						<div className="text-sm text-white truncate max-w-full">
							{repliedMessage.message || (repliedMessage.audio ? "Audio message" : "")}
						</div>
						<button
							type="button"
							className="absolute top-1 right-1 text-gray-400 hover:text-gray-200"
							onClick={() => setRepliedMessage(null)}
						>
							&times;
						</button>
					</div>
				)}
				<div className='relative flex items-end'>
					<textarea
						ref={textareaRef}
						rows='1'
						className='border text-sm md:text-base rounded-b-lg block w-full p-2.5 md:p-3 bg-gray-700 border-gray-600 text-white pr-20 resize-none overflow-y-auto'
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
						disabled={isRecording}
					/>
					<div className='absolute bottom-2 md:bottom-3 end-3 md:end-4 flex items-center space-x-2'>
						<button
							type='button'
							className={`flex items-center justify-center hover:text-sky-400 transition-colors ${isRecording ? 'text-red-500' : ''}`}
							onMouseDown={startRecording}
							onMouseUp={stopRecording}
							disabled={loading}
						>
							<BsMic className='w-5 h-5 md:w-6 md:h-6' />
						</button>
						<button
							type='submit'
							className='flex items-center justify-center hover:text-sky-400 transition-colors'
							disabled={loading || !message.trim()}
						>
							{loading ? <div className='loading loading-spinner'></div> : <BsSend className='w-5 h-5 md:w-6 md:h-6' />}
						</button>
					</div>
				</div>
			</div>
		</form>
	);
};

export default MessageInput;
