import { useState, useEffect, useRef } from "react";
import { BsSend, BsMic, BsPauseFill, BsTrash } from "react-icons/bs";
import useSendMessage from "../../hooks/useSendMessage";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";

const MessageInput = () => {
	const [message, setMessage] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [recordingTime, setRecordingTime] = useState(0);
	const [audioLevels, setAudioLevels] = useState(new Array(20).fill(0)); // Array for multiple bars
	const { loading, sendMessage } = useSendMessage();
	const { selectedConversation, repliedMessage, setRepliedMessage } = useConversation();
	const { socket } = useSocketContext();
	const typingTimeoutRef = useRef(null);
	const textareaRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const audioChunksRef = useRef([]);
	const recordingIntervalRef = useRef(null);
	const audioContextRef = useRef(null);
	const analyserRef = useRef(null);
	const dataArrayRef = useRef(null);
	const animationFrameIdRef = useRef(null);

	useEffect(() => {
		if (repliedMessage && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [repliedMessage]);

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

	const updateAudioLevels = () => {
		if (!analyserRef.current) return;
		analyserRef.current.getByteFrequencyData(dataArrayRef.current);
		const levels = [];
		const step = Math.floor(dataArrayRef.current.length / 20);
		for (let i = 0; i < 20; i++) {
			let sum = 0;
			for (let j = 0; j < step; j++) {
				sum += dataArrayRef.current[i * step + j];
			}
			const avg = sum / step;
			levels[i] = avg;
		}
		setAudioLevels(levels);
		animationFrameIdRef.current = requestAnimationFrame(updateAudioLevels);
	};

	const startRecording = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorderRef.current = new MediaRecorder(stream);
			audioChunksRef.current = [];

			// Setup AudioContext and AnalyserNode for audio level detection
			audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
			const source = audioContextRef.current.createMediaStreamSource(stream);
			analyserRef.current = audioContextRef.current.createAnalyser();
			analyserRef.current.fftSize = 256;
			const bufferLength = analyserRef.current.frequencyBinCount;
			dataArrayRef.current = new Uint8Array(bufferLength);
			source.connect(analyserRef.current);

			// Start animation loop
			updateAudioLevels();

			mediaRecorderRef.current.shouldSendAudio = true;
			mediaRecorderRef.current.ondataavailable = (event) => {
				audioChunksRef.current.push(event.data);
			};

			mediaRecorderRef.current.onstop = async () => {
				if (mediaRecorderRef.current.shouldSendAudio && audioChunksRef.current.length > 0) {
					const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
					await sendMessage("", audioBlob, repliedMessage ? repliedMessage._id : null);
				}
				mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
				setRecordingTime(0);
				setIsPaused(false);
				setIsRecording(false);
				setAudioLevel(0);
				// Cleanup AudioContext and animation
				if (animationFrameIdRef.current) {
					cancelAnimationFrame(animationFrameIdRef.current);
				}
				if (audioContextRef.current) {
					audioContextRef.current.close();
					audioContextRef.current = null;
				}
			};

			mediaRecorderRef.current.start();
			setIsRecording(true);
			setIsPaused(false);
			recordingIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
		} catch (error) {
			console.error("Error starting recording:", error);
		}
	};

	const pauseRecording = () => {
		if (mediaRecorderRef.current && isRecording && !isPaused) {
			mediaRecorderRef.current.pause();
			setIsPaused(true);
			clearInterval(recordingIntervalRef.current);
			if (animationFrameIdRef.current) {
				cancelAnimationFrame(animationFrameIdRef.current);
			}
		}
	};

	const resumeRecording = () => {
		if (mediaRecorderRef.current && isRecording && isPaused) {
			mediaRecorderRef.current.resume();
			setIsPaused(false);
			recordingIntervalRef.current = setInterval(() => {
				setRecordingTime(prev => prev + 1);
			}, 1000);
			updateAudioLevel();
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current && isRecording) {
			mediaRecorderRef.current.stop();
			setIsRecording(false);
			setIsPaused(false);
			clearInterval(recordingIntervalRef.current);
			if (animationFrameIdRef.current) {
				cancelAnimationFrame(animationFrameIdRef.current);
			}
			if (audioContextRef.current) {
				audioContextRef.current.close();
				audioContextRef.current = null;
			}
			setAudioLevel(0);
		}
	};

	const deleteRecording = () => {
		if (mediaRecorderRef.current) {
			try {
				mediaRecorderRef.current.shouldSendAudio = false;
				if (mediaRecorderRef.current.state !== "inactive") {
					mediaRecorderRef.current.stop();
				}
				clearInterval(recordingIntervalRef.current);
				audioChunksRef.current = [];
				setRecordingTime(0);
				setIsRecording(false);
				setIsPaused(false);
				if (animationFrameIdRef.current) {
					cancelAnimationFrame(animationFrameIdRef.current);
				}
				if (audioContextRef.current) {
					audioContextRef.current.close();
					audioContextRef.current = null;
				}
				setAudioLevel(0);
			} catch (err) {
				console.error(err);
			}
		}
	};

	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
	};

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
						onChange={(e) => {
							setMessage(e.target.value);
							handleTyping();
							adjustTextareaHeight();
						}}
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
						{!isRecording ? (
							<>
								<button
									type='button'
									className='flex items-center justify-center hover:text-sky-400 transition-colors'
									onClick={startRecording}
									disabled={loading || isRecording}
								>
									<BsMic className='w-5 h-5 md:w-6 md:h-6' />
								</button>

								<button
									type='submit'
									className='flex items-center justify-center hover:text-sky-400 transition-colors'
									disabled={loading || !message.trim() || isRecording}
								>
									{loading ? (
										<div className='loading loading-spinner'></div>
									) : (
										<BsSend className='w-5 h-5 md:w-6 md:h-6' />
									)}
								</button>
							</>
						) : (
							<div className="flex items-center space-x-3 text-white">
								{/* Red pulsing recording dot */}
								<span className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></span>
								{/* Recording timer */}
								<span className="font-mono text-sm select-none">{formatTime(recordingTime)}</span>

								{/* Audio level bars */}
								<div className="flex space-x-0.5 w-20 h-4 items-end">
									{audioLevels.map((level, index) => (
										<div
											key={index}
											className="bg-green-400 rounded-sm transition-all duration-100"
											style={{ height: `${Math.min(level / 2, 20)}px`, width: '3px' }}
										></div>
									))}
								</div>

								{/* Pause/Resume button */}
								<button
									type="button"
									className="focus:outline-none"
									onClick={() => (isPaused ? resumeRecording() : pauseRecording())}
								>
									{isPaused ? (
										<BsMic className="w-5 h-5 md:w-6 md:h-6" />
									) : (
										<BsPauseFill className="w-5 h-5 md:w-6 md:h-6" />
									)}
								</button>

								{/* Delete button */}
								<button
									type="button"
									className="focus:outline-none"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										deleteRecording();
									}}
								>
									<BsTrash className="w-5 h-5 md:w-6 md:h-6" />
								</button>

								{/* Send button */}
								<button
									type="button"
									className="focus:outline-none"
									onClick={() => {
										stopRecording();
									}}
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 16 16">
										<path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576 6.636 10.07Zm6.787-8.201L1.591 6.602l4.339 2.76 7.494-7.493Z" />
									</svg>
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</form>
	);
};

export default MessageInput;
