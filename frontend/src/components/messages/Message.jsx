import { useAuthContext } from "../../context/AuthContext";
import { extractTime } from "../../utils/extractTime";
import useConversation from "../../zustand/useConversation";
import { useState, useRef, useEffect } from "react";

	const Message = ({ message, onDeleteMessage, repliedMessage, contextMenuMessageId, setContextMenuMessageId, scrollContainerRef }) => {
	const { authUser } = useAuthContext();
	const { selectedConversation } = useConversation();
	const fromMe = message.senderId === authUser._id;
	const formattedTime = extractTime(message.createdAt);
	const chatClassName = fromMe ? "chat-end" : "chat-start";
	const profilePic = fromMe ? authUser.profilePic : selectedConversation?.profilePic;
	const bubbleBgColor = fromMe ? "bg-blue-500" : "";

	const shakeClass = message.shouldShake ? "shake" : "";

	const audioRef = useRef(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [copyMessageVisible, setCopyMessageVisible] = useState(false);
	const [copyMessageText, setCopyMessageText] = useState("");
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleteType, setDeleteType] = useState("me"); // default to "delete for me"
	const messageRef = useRef(null);
	const [isMenuAbove, setIsMenuAbove] = useState(true);

	const confirmDelete = async () => {
		try {
			const response = await fetch(`/api/messages/${message._id}?deleteType=${deleteType}`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			if (response.ok) {
				setShowDeleteModal(false);
				if (onDeleteMessage) {
					onDeleteMessage(message._id);
				}
			} else {
				alert("Failed to delete message");
			}
		} catch (error) {
			console.error("Error deleting message:", error);
			alert("Error deleting message");
		}
	};

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const updateProgress = () => {
			setProgress(audio.currentTime);
		};

		const setAudioDuration = () => {
			setDuration(audio.duration);
		};

		audio.addEventListener("timeupdate", updateProgress);
		audio.addEventListener("ended", () => setIsPlaying(false));
		audio.addEventListener("loadedmetadata", setAudioDuration);

		return () => {
			audio.removeEventListener("timeupdate", updateProgress);
			audio.removeEventListener("ended", () => setIsPlaying(false));
			audio.removeEventListener("loadedmetadata", setAudioDuration);
		};
	}, []);

	const togglePlay = () => {
		const audio = audioRef.current;
		if (!audio) return;

		if (isPlaying) {
			audio.pause();
			setIsPlaying(false);
		} else {
			audio.play();
			setIsPlaying(true);
		}
	};

	const changePlaybackRate = () => {
		const audio = audioRef.current;
		if (!audio) return;

		let newRate;
		if (playbackRate === 1) newRate = 1.5;
		else if (playbackRate === 1.5) newRate = 2;
		else newRate = 1;

		audio.playbackRate = newRate;
		setPlaybackRate(newRate);
	};

	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
	};

	const handleContextMenu = (e) => {
		e.preventDefault();
		if (messageRef.current && scrollContainerRef && scrollContainerRef.current) {
			const messageRect = messageRef.current.getBoundingClientRect();
			const containerRect = scrollContainerRef.current.getBoundingClientRect();
			const menuHeight = 150; // approximate height of the menu in pixels
			const spaceBelow = containerRect.bottom - messageRect.bottom;
			const spaceAbove = messageRect.top - containerRect.top;
			console.log("messageRect.top:", messageRect.top, "messageRect.bottom:", messageRect.bottom);
			console.log("containerRect.top:", containerRect.top, "containerRect.bottom:", containerRect.bottom);
			console.log("spaceAbove:", spaceAbove, "spaceBelow:", spaceBelow);
			// If there is not enough space below to show the menu, open above
			if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
				console.log("Not enough space below, opening menu above");
				setIsMenuAbove(true);
			} else {
				console.log("Opening menu below");
				setIsMenuAbove(false);
			}
		} else {
			console.log("messageRef or scrollContainerRef is null");
		}
		setContextMenuMessageId(message._id);
	};

	const handleClickOutside = () => {
		setContextMenuMessageId(null);
	};

	const handleDeleteMessage = async () => {
		try {
			const response = await fetch(`/api/messages/${message._id}`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`, // Assuming token is stored in localStorage
				},
			});
			if (response.ok) {
				setContextMenuMessageId(null);
				if (onDeleteMessage) {
					onDeleteMessage(message._id);
				}
			} else {
				alert("Failed to delete message");
			}
		} catch (error) {
			console.error("Error deleting message:", error);
			alert("Error deleting message");
		}
	};

	useEffect(() => {
		if (contextMenuMessageId !== null) {
			document.addEventListener("click", handleClickOutside);
		} else {
			document.removeEventListener("click", handleClickOutside);
		}
		return () => {
			document.removeEventListener("click", handleClickOutside);
		};
	}, [contextMenuMessageId]);

	return (
		<div
			ref={messageRef}
			className={`chat ${chatClassName}`}
			style={{ position: "relative" }}
		>
			<div className='chat-image avatar'>
				<div className='w-8 md:w-10 rounded-full'>
					<img alt='Tailwind CSS chat bubble component' src={profilePic} />
				</div>
			</div>
			<div
				className={`chat-bubble text-white text-sm md:text-base ${bubbleBgColor} ${shakeClass} pb-2 break-words max-w-[75%] sm:max-w-xs md:max-w-md cursor-pointer relative`}
				onContextMenu={handleContextMenu}
			>
				{repliedMessage && (
					<div
						className="mb-1 p-2 rounded border-l-4 border-blue-400 bg-blue-900 text-xs text-gray-300 max-w-[90%] whitespace-pre-wrap break-words overflow-hidden text-ellipsis"
						style={{ wordBreak: "break-word", whiteSpace: "pre-wrap", maxHeight: "4.5rem", overflowY: "auto" }}
					>
						{repliedMessage.audio ? "Audio message" : repliedMessage.message}
					</div>
				)}
				{message.audio ? (
					<div className="flex items-center space-x-2 select-none relative bg-blue-500 rounded-lg p-2 max-w-[75%] sm:max-w-xs md:max-w-md cursor-pointer">
						<button
							className="relative flex items-center justify-center w-10 h-10 rounded-full bg-blue-700 hover:bg-blue-600 focus:outline-none"
							onClick={(e) => {
								e.stopPropagation();
								togglePlay();
							}}
						>
							{isPlaying ? (
								<>
									{/* Red recording dot */}
									<span className="absolute left-3 top-3 w-4 h-4 bg-red-600 rounded-full animate-pulse"></span>
									{/* Pause icon */}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="h-6 w-6 text-white"
										fill="currentColor"
										viewBox="0 0 24 24"
										stroke="none"
									>
										<rect x="6" y="5" width="4" height="14" rx="1" ry="1" />
										<rect x="14" y="5" width="4" height="14" rx="1" ry="1" />
									</svg>
								</>
							) : (
								// Play icon
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="h-6 w-6 text-white"
									fill="currentColor"
									viewBox="0 0 24 24"
									stroke="none"
								>
									<path d="M8 5v14l11-7z" />
								</svg>
							)}
						</button>
						<div className="flex-1 ml-3">
							{/* Waveform style progress bar */}
							<div className="relative h-4 bg-blue-600 rounded overflow-hidden">
								<div
									className="absolute top-0 left-0 h-4 bg-white rounded"
									style={{
										width:
											audioRef.current && audioRef.current.duration
												? `${(progress / audioRef.current.duration) * 100}%`
												: "0%",
										transition: "width 0.1s linear",
									}}
								/>
								{/* Optional: Add waveform bars or animation here */}
							</div>
							<div className="text-xs text-right mt-1 text-white select-none">
								{formatTime(progress)} / {formatTime(duration)}
							</div>
						</div>
						<button
							className="text-xs text-white bg-blue-700 rounded px-2 py-1 ml-3"
							onClick={(e) => {
								e.stopPropagation();
								changePlaybackRate();
							}}
						>
							{playbackRate}x
						</button>
						{/* Delete icon */}
						{/* Removed delete icon button as per user request */}
						{/*
						<button
							className="text-white ml-3 focus:outline-none"
							onClick={(e) => {
								e.stopPropagation();
								setShowDeleteModal(true);
							}}
							title="Delete audio message"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="h-6 w-6"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0a1 1 0 00-1 1v1h6V4a1 1 0 00-1-1m-4 0h4"
								/>
							</svg>
						</button>
						*/}
						<audio ref={audioRef} src={message.audio} preload="auto" />
					</div>
				) : (
					message.message
				)}
				{contextMenuMessageId === message._id && (
					<ul
						className={`absolute bg-gray-900 bg-opacity-90 text-white rounded-lg shadow-lg py-2 z-50 min-w-[180px] max-w-xs sm:max-w-sm space-y-1 ${
							fromMe ? "right-0" : "left-0"
						}`}
						onClick={(e) => e.stopPropagation()}
						style={{
							boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
							bottom: isMenuAbove ? "100%" : "auto",
							top: isMenuAbove ? "auto" : "100%",
							marginBottom: isMenuAbove ? "0.25rem" : "0",
							marginTop: isMenuAbove ? "0" : "0.25rem",
						}}
					>
						<li
							className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded"
							onClick={(e) => {
								e.stopPropagation();
								useConversation.getState().setRepliedMessage(message);
								setContextMenuMessageId(null);
							}}
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M3 10h4l3 8 4-16 3 8h4" />
							</svg>
							<span>Reply</span>
						</li>
						<li
							className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded"
							onClick={(e) => {
								e.stopPropagation();
								if (message.audio) {
									navigator.clipboard.writeText(message.audio);
									alert("Audio URL copied to clipboard");
								} else {
									navigator.clipboard.writeText(message.message);
									alert("Message copied to clipboard");
								}
								setContextMenuMessageId(null);
							}}
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8m-8-4h8M4 6h16M4 18h16" />
							</svg>
							<span>Copy</span>
						</li>
						{message.audio && (
							<li className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded">
								<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
								</svg>
								<span>Save as...</span>
							</li>
						)}
						<li className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded">
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16h16" />
							</svg>
							<span>Forward</span>
						</li>
						<li className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded">
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
							</svg>
							<span>Star</span>
						</li>
						<li className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded">
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
							</svg>
							<span>Pin</span>
						</li>
						<li
							className="flex items-center px-4 py-2 cursor-pointer hover:bg-red-600 rounded"
							onClick={(e) => {
								e.stopPropagation();
								setContextMenuMessageId(null);
								setShowDeleteModal(true);
							}}
						>
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0a1 1 0 00-1 1v1h6V4a1 1 0 00-1-1m-4 0h4" />
							</svg>
							<span>Delete</span>
						</li>
						<li className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-700 rounded">
							<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h5l5 6v10a2 2 0 01-2 2z" />
							</svg>
							<span>Select</span>
						</li>
					</ul>
				)}
			</div>
			<div className='chat-footer opacity-50 text-xs flex gap-1 items-center'>
				{formattedTime}
				{fromMe && (
					<span className='text-xs'>
						{message.isSeen ? (
							<span className='text-blue-400'>✓✓</span>
						) : (
							<span className='text-gray-400'>✓</span>
						)}
					</span>
				)}
			</div>
			{showDeleteModal && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
					<div className="bg-gray-900 rounded-lg p-6 w-80">
						<h2 className="text-white text-lg mb-4">Delete message?</h2>
						<p className="text-gray-300 mb-4">You can delete messages for everyone or just for yourself.</p>
						<div className="mb-4">
							<label className="inline-flex items-center mr-4">
								<input
									type="radio"
									name="deleteType"
									value="me"
									checked={deleteType === "me"}
									onChange={() => setDeleteType("me")}
									className="form-radio"
								/>
								<span className="ml-2 text-gray-300">Delete for me</span>
							</label>
							{message.senderId === authUser._id && (
								<label className="inline-flex items-center">
									<input
										type="radio"
										name="deleteType"
										value="everyone"
										checked={deleteType === "everyone"}
										onChange={() => setDeleteType("everyone")}
										className="form-radio"
									/>
									<span className="ml-2 text-gray-300">Delete for everyone</span>
								</label>
							)}
						</div>
						<div className="flex justify-end space-x-4">
							<button
								className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
								onClick={confirmDelete}
							>
								Delete
							</button>
							<button
								className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
								onClick={() => setShowDeleteModal(false)}
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
export default Message;
