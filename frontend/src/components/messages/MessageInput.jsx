import { useEffect, useRef, useState } from "react";
import data from "@emoji-mart/data";
import { BsMic, BsPauseFill, BsSend, BsTrash } from "react-icons/bs";
import { HiMagnifyingGlass, HiOutlineFaceSmile, HiOutlinePaperAirplane, HiOutlineXMark } from "react-icons/hi2";
import { IoAttachOutline, IoDocumentOutline, IoImageOutline, IoPulseOutline, IoRadioOutline, IoVideocamOutline } from "react-icons/io5";
import useSendMessage from "../../hooks/useSendMessage";
import { stopAllChatAudio } from "../../utils/audioPlayback";
import { unifiedToNativeEmoji } from "../../utils/flagEmoji";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";
import FlagText, { FlagEmoji } from "../common/FlagText";
import {
	formatAttachmentSize,
	getAttachmentKindLabel,
	getAttachmentTypeFromMimeType,
	getMessageSummaryText,
	isImageAttachment,
	isVideoAttachment,
} from "../../utils/messageAttachments";

const EMOJI_CATEGORY_META = [
	{ id: "people", label: "Smileys & People", icon: "😀" },
	{ id: "nature", label: "Animals & Nature", icon: "🌿" },
	{ id: "foods", label: "Food & Drink", icon: "🍔" },
	{ id: "activity", label: "Activity", icon: "⚽" },
	{ id: "places", label: "Travel & Places", icon: "🚗" },
	{ id: "objects", label: "Objects", icon: "💡" },
	{ id: "symbols", label: "Symbols", icon: "💯" },
	{ id: "flags", label: "Flags", icon: "🚩" },
];

const EMOJI_CATEGORIES = EMOJI_CATEGORY_META.map((categoryMeta) => {
	const sourceCategory = data.categories.find((category) => category.id === categoryMeta.id);
	const emojis = (sourceCategory?.emojis || [])
		.map((emojiId) => {
			const emoji = data.emojis[emojiId];
			const primarySkin = emoji?.skins?.[0];
			const normalizedNative =
				categoryMeta.id === "flags" && primarySkin?.unified
					? unifiedToNativeEmoji(primarySkin.unified)
					: primarySkin?.native;

			if (!emoji || !normalizedNative) return null;

			return {
				id: emoji.id,
				categoryId: categoryMeta.id,
				name: emoji.name || emojiId,
				keywords: emoji.keywords || [],
				native: normalizedNative,
				unified: primarySkin?.unified?.toLowerCase() || "",
			};
		})
		.filter(Boolean);

	return {
		...categoryMeta,
		emojis,
	};
});

const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((category) =>
	category.emojis.map((emoji) => ({
		...emoji,
		categoryId: category.id,
		categoryLabel: category.label,
	}))
);

const findEmojiCategory = (categoryId) =>
	EMOJI_CATEGORIES.find((category) => category.id === categoryId) || EMOJI_CATEGORIES[0];

const emojiMatchesSearch = (emoji, query) => {
	if (!query) return true;

	const searchableText = [emoji.id, emoji.name, ...(emoji.keywords || [])].join(" ").toLowerCase();
	return searchableText.includes(query);
};

const getSupportedAudioMimeType = () => {
	if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
		return "";
	}

	const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
	return preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
};

const DRAFT_CACHE_PREFIX = "chat:draft:v1:";

const buildDraftCacheKey = (conversation) => {
	if (!conversation?._id) return "";
	const conversationType = conversation.type === "GROUP" ? "GROUP" : "DIRECT";
	return `${DRAFT_CACHE_PREFIX}${conversationType}:${conversation._id}`;
};

const getDraftValue = (conversation) => {
	const draftKey = buildDraftCacheKey(conversation);
	if (!draftKey) return "";

	try {
		const cachedDraft = localStorage.getItem(draftKey);
		return typeof cachedDraft === "string" ? cachedDraft : "";
	} catch {
		return "";
	}
};

const saveDraftValue = (conversation, nextDraft) => {
	const draftKey = buildDraftCacheKey(conversation);
	if (!draftKey) return;

	try {
		if (nextDraft) {
			localStorage.setItem(draftKey, nextDraft);
		} else {
			localStorage.removeItem(draftKey);
		}
	} catch {
		// Ignore localStorage failures.
	}
};

const clearDraftValue = (conversation) => {
	saveDraftValue(conversation, "");
};

const MessageInput = () => {
	const MOBILE_TEXTAREA_HEIGHT = 44;
	const DESKTOP_TEXTAREA_HEIGHT = 52;
	const [message, setMessage] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [recordingTime, setRecordingTime] = useState(0);
	const [audioLevels, setAudioLevels] = useState(new Array(20).fill(0));
	const [attachmentFile, setAttachmentFile] = useState(null);
	const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [emojiSearch, setEmojiSearch] = useState("");
	const [activeEmojiCategory, setActiveEmojiCategory] = useState(EMOJI_CATEGORIES[0].id);
	const [isCompactViewport, setIsCompactViewport] = useState(
		typeof window !== "undefined" ? window.innerWidth < 640 : false
	);

	const { loading, sendMessage } = useSendMessage();
	const { selectedConversation, repliedMessage, setRepliedMessage } = useConversation();
	const { socket } = useSocketContext();

	const typingTimeoutRef = useRef(null);
	const emojiButtonRef = useRef(null);
	const emojiPanelRef = useRef(null);
	const emojiScrollRef = useRef(null);
	const textareaRef = useRef(null);
	const attachmentInputRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const audioChunksRef = useRef([]);
	const recordingIntervalRef = useRef(null);
	const audioContextRef = useRef(null);
	const analyserRef = useRef(null);
	const dataArrayRef = useRef(null);
	const animationFrameIdRef = useRef(null);
	const audioMimeTypeRef = useRef(getSupportedAudioMimeType());
	const recordingTimeRef = useRef(0);
	const recordingStartedAtRef = useRef(null);
	const accumulatedRecordingMsRef = useRef(0);
	const finalRecordingDurationSecondsRef = useRef(0);
	const attachmentPreviewUrlRef = useRef(null);
	const selectedConversationRef = useRef(selectedConversation);

	useEffect(() => {
		selectedConversationRef.current = selectedConversation;
	}, [selectedConversation]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return undefined;
		}

		const updateViewportState = () => {
			setIsCompactViewport(window.innerWidth < 640);
		};

		updateViewportState();
		window.addEventListener("resize", updateViewportState);
		window.addEventListener("orientationchange", updateViewportState);

		return () => {
			window.removeEventListener("resize", updateViewportState);
			window.removeEventListener("orientationchange", updateViewportState);
		};
	}, []);

	useEffect(() => {
		if (repliedMessage && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [repliedMessage]);

	useEffect(() => {
		const nextDraft = getDraftValue(selectedConversation);
		setMessage(nextDraft);
		setTimeout(() => {
			adjustTextareaHeight();
		}, 0);
	}, [selectedConversation?._id, selectedConversation?.type]);

	useEffect(() => {
		saveDraftValue(selectedConversation, message);
	}, [selectedConversation?._id, selectedConversation?.type, message]);

	useEffect(() => {
		return () => {
			if (attachmentPreviewUrlRef.current) {
				URL.revokeObjectURL(attachmentPreviewUrlRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!showEmojiPicker) {
			setEmojiSearch("");
		}
	}, [showEmojiPicker]);

	useEffect(() => {
		if (!showEmojiPicker) {
			return undefined;
		}

		const handleOutsideEmojiPickerClick = (event) => {
			const eventTarget = event.target;
			if (
				emojiPanelRef.current?.contains(eventTarget) ||
				emojiButtonRef.current?.contains(eventTarget)
			) {
				return;
			}

			setShowEmojiPicker(false);
		};

		document.addEventListener("mousedown", handleOutsideEmojiPickerClick);
		document.addEventListener("touchstart", handleOutsideEmojiPickerClick);

		return () => {
			document.removeEventListener("mousedown", handleOutsideEmojiPickerClick);
			document.removeEventListener("touchstart", handleOutsideEmojiPickerClick);
		};
	}, [showEmojiPicker]);

	useEffect(() => {
		if (!showEmojiPicker) {
			return undefined;
		}

		const handleEmojiEscape = (event) => {
			if (event.key === "Escape") {
				setShowEmojiPicker(false);
			}
		};

		window.addEventListener("keydown", handleEmojiEscape);

		return () => {
			window.removeEventListener("keydown", handleEmojiEscape);
		};
	}, [showEmojiPicker]);

	useEffect(() => {
		if (emojiScrollRef.current) {
			emojiScrollRef.current.scrollTop = 0;
		}
	}, [showEmojiPicker, emojiSearch, activeEmojiCategory]);

	const adjustTextareaHeight = () => {
		const textarea = textareaRef.current;
		if (!textarea) return;

		const height = isCompactViewport ? MOBILE_TEXTAREA_HEIGHT : DESKTOP_TEXTAREA_HEIGHT;
		textarea.style.height = `${height}px`;
	};

	const getElapsedRecordingMs = () => {
		const activeSegmentMs = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 0;
		return accumulatedRecordingMsRef.current + activeSegmentMs;
	};

	const syncRecordingTime = () => {
		const nextRecordingTime = Math.max(0, Math.floor(getElapsedRecordingMs() / 1000));
		recordingTimeRef.current = nextRecordingTime;
		setRecordingTime(nextRecordingTime);
	};

	const getFinalRecordingDurationSeconds = () => {
		const elapsedMs = getElapsedRecordingMs();
		if (elapsedMs <= 0) return 0;
		return Math.floor(elapsedMs / 1000);
	};

	const resetRecordingTracking = () => {
		recordingStartedAtRef.current = null;
		accumulatedRecordingMsRef.current = 0;
		recordingTimeRef.current = 0;
		finalRecordingDurationSecondsRef.current = 0;
		setRecordingTime(0);
	};

	const handleTyping = () => {
		if (!selectedConversation || selectedConversation.type !== "DIRECT") return;

		socket?.emit("typing", selectedConversation._id);

		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}

		typingTimeoutRef.current = setTimeout(() => {
			socket?.emit("stopTyping", selectedConversation._id);
		}, 2000);
	};

	const emitRecordingState = (eventName, conversation = selectedConversationRef.current) => {
		if (!conversation || conversation.type !== "DIRECT") return;
		socket?.emit(eventName, conversation._id);
	};

	const insertEmojiAtCursor = (emoji) => {
		const textarea = textareaRef.current;
		if (!textarea) {
			setMessage((currentMessage) => `${currentMessage}${emoji}`);
			return;
		}

		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const newMessage = message.slice(0, start) + emoji + message.slice(end);
		setMessage(newMessage);

		setTimeout(() => {
			textarea.focus();
			textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
			adjustTextareaHeight();
		}, 0);
	};

	const clearSelectedAttachment = () => {
		if (attachmentPreviewUrlRef.current) {
			URL.revokeObjectURL(attachmentPreviewUrlRef.current);
			attachmentPreviewUrlRef.current = null;
		}

		setAttachmentFile(null);
		setAttachmentPreviewUrl("");
		if (attachmentInputRef.current) {
			attachmentInputRef.current.value = "";
		}
	};

	const handleAttachmentSelect = (event) => {
		const nextFile = event.target.files?.[0];
		if (!nextFile) return;

		if (attachmentPreviewUrlRef.current) {
			URL.revokeObjectURL(attachmentPreviewUrlRef.current);
			attachmentPreviewUrlRef.current = null;
		}

		const nextAttachmentType = getAttachmentTypeFromMimeType(nextFile.type, nextFile.name);
		const shouldPreview = nextAttachmentType === "IMAGE" || nextAttachmentType === "VIDEO";
		const nextPreviewUrl = shouldPreview ? URL.createObjectURL(nextFile) : "";

		if (nextPreviewUrl) {
			attachmentPreviewUrlRef.current = nextPreviewUrl;
		}

		setAttachmentFile(nextFile);
		setAttachmentPreviewUrl(nextPreviewUrl);
		setShowEmojiPicker(false);
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		if (!message.trim() && !attachmentFile) return;
		const conversationAtSubmit = selectedConversation;
		const submittedMessage = message;

		if (conversationAtSubmit?.type === "DIRECT") {
			socket?.emit("stopTyping", conversationAtSubmit._id);
		}

		if (typingTimeoutRef.current) {
			clearTimeout(typingTimeoutRef.current);
		}

		const result = await sendMessage({
			message: submittedMessage,
			attachmentFile,
			repliedMessageId: repliedMessage ? repliedMessage._id : null,
		});
		if (!result?.ok) return;

		clearDraftValue(conversationAtSubmit);
		const activeConversation = selectedConversationRef.current;
		const isStillSameConversation =
			activeConversation?._id === conversationAtSubmit?._id &&
			activeConversation?.type === conversationAtSubmit?.type;

		if (isStillSameConversation) {
			setMessage("");
			if (textareaRef.current) {
				const height = isCompactViewport ? MOBILE_TEXTAREA_HEIGHT : DESKTOP_TEXTAREA_HEIGHT;
				textareaRef.current.style.height = `${height}px`;
			}
		}

		clearSelectedAttachment();
		setRepliedMessage(null);
	};

	const updateAudioLevels = () => {
		if (!analyserRef.current) return;

		analyserRef.current.getByteFrequencyData(dataArrayRef.current);
		const levels = [];
		const step = Math.floor(dataArrayRef.current.length / 20);

		for (let i = 0; i < 20; i += 1) {
			let sum = 0;
			for (let j = 0; j < step; j += 1) {
				sum += dataArrayRef.current[i * step + j];
			}
			levels[i] = sum / step;
		}

		setAudioLevels(levels);
		animationFrameIdRef.current = requestAnimationFrame(updateAudioLevels);
	};

	const startRecording = async () => {
		try {
			if (attachmentFile) {
				return;
			}
			setShowEmojiPicker(false);
			stopAllChatAudio({ reset: true });
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const recorderOptions = audioMimeTypeRef.current
				? { mimeType: audioMimeTypeRef.current, audioBitsPerSecond: 24000 }
				: { audioBitsPerSecond: 24000 };
			mediaRecorderRef.current = new MediaRecorder(stream, recorderOptions);
			audioChunksRef.current = [];

			audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
			const source = audioContextRef.current.createMediaStreamSource(stream);
			analyserRef.current = audioContextRef.current.createAnalyser();
			analyserRef.current.fftSize = 256;
			dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
			source.connect(analyserRef.current);

			updateAudioLevels();

			mediaRecorderRef.current.shouldSendAudio = true;
			mediaRecorderRef.current.ondataavailable = (event) => {
				audioChunksRef.current.push(event.data);
			};

			mediaRecorderRef.current.onstop = () => {
				const shouldSendAudio = Boolean(mediaRecorderRef.current?.shouldSendAudio);
				const nextAudioChunks = [...audioChunksRef.current];
				const mimeType = mediaRecorderRef.current?.mimeType || audioMimeTypeRef.current || "audio/webm";
				const recordedDurationSeconds = finalRecordingDurationSecondsRef.current;

				mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
				emitRecordingState("recording:stop");
				setIsPaused(false);
				setIsRecording(false);
				setAudioLevels(new Array(20).fill(0));
				audioChunksRef.current = [];
				resetRecordingTracking();

				if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
				if (audioContextRef.current) {
					audioContextRef.current.close();
					audioContextRef.current = null;
				}

				if (shouldSendAudio && nextAudioChunks.length > 0) {
					const audioBlob = new Blob(nextAudioChunks, { type: mimeType });
					void sendMessage({
						message: "",
						audioBlob,
						repliedMessageId: repliedMessage ? repliedMessage._id : null,
						audioDurationSeconds: recordedDurationSeconds,
					});
					if (repliedMessage) {
						setRepliedMessage(null);
					}
				}
			};

			resetRecordingTracking();
			recordingStartedAtRef.current = Date.now();
			mediaRecorderRef.current.start(250);
			emitRecordingState("recording:start");
			setIsRecording(true);
			setIsPaused(false);
			recordingIntervalRef.current = setInterval(syncRecordingTime, 250);
		} catch (error) {
			console.error("Error starting recording:", error);
		}
	};

	const pauseRecording = () => {
		if (!mediaRecorderRef.current || !isRecording || isPaused) return;

		mediaRecorderRef.current.pause();
		accumulatedRecordingMsRef.current = getElapsedRecordingMs();
		recordingStartedAtRef.current = null;
		syncRecordingTime();
		emitRecordingState("recording:stop");
		setIsPaused(true);
		clearInterval(recordingIntervalRef.current);
		if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
	};

	const resumeRecording = () => {
		if (!mediaRecorderRef.current || !isRecording || !isPaused) return;

		mediaRecorderRef.current.resume();
		recordingStartedAtRef.current = Date.now();
		emitRecordingState("recording:start");
		setIsPaused(false);
		recordingIntervalRef.current = setInterval(syncRecordingTime, 250);
		updateAudioLevels();
	};

	const stopRecording = () => {
		if (!mediaRecorderRef.current || !isRecording) return;

		finalRecordingDurationSecondsRef.current = getFinalRecordingDurationSeconds();
		accumulatedRecordingMsRef.current = getElapsedRecordingMs();
		recordingStartedAtRef.current = null;
		emitRecordingState("recording:stop");
		mediaRecorderRef.current.stop();
		clearInterval(recordingIntervalRef.current);
		if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);

		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}
	};

	const deleteRecording = () => {
		if (!mediaRecorderRef.current) return;

		try {
			finalRecordingDurationSecondsRef.current = 0;
			mediaRecorderRef.current.shouldSendAudio = false;
			emitRecordingState("recording:stop");
			if (mediaRecorderRef.current.state !== "inactive") {
				mediaRecorderRef.current.stop();
			}

			clearInterval(recordingIntervalRef.current);
			audioChunksRef.current = [];
			setIsRecording(false);
			setIsPaused(false);
			setAudioLevels(new Array(20).fill(0));
			resetRecordingTracking();

			if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
			if (audioContextRef.current) {
				audioContextRef.current.close();
				audioContextRef.current = null;
			}
		} catch (error) {
			console.error(error);
		}
	};

	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
	};

	const audioPeak = audioLevels.reduce((maxLevel, currentLevel) => Math.max(maxLevel, currentLevel), 0);
	const inputStrengthLabel = isPaused
		? "Monitoring paused"
		: audioPeak > 120
			? "High input"
			: audioPeak > 65
				? "Clean signal"
				: audioPeak > 24
					? "Listening"
					: "Stand by";

	const actionButtonClassName =
		"inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-10";
	const emojiPanelStyle = {
		maxHeight: isCompactViewport ? "min(22rem, calc(100dvh - 8rem))" : "min(26rem, calc(100dvh - 10rem))",
	};
	const emojiGridStyle = {
		maxHeight: isCompactViewport ? "min(13rem, calc(100dvh - 13rem))" : "min(17rem, calc(100dvh - 15rem))",
	};
	const normalizedEmojiSearch = emojiSearch.trim().toLowerCase();
	const currentEmojiCategory = findEmojiCategory(activeEmojiCategory);
	const visibleEmojis = normalizedEmojiSearch
		? ALL_EMOJIS.filter((emoji) => emojiMatchesSearch(emoji, normalizedEmojiSearch)).slice(0, 360)
		: currentEmojiCategory.emojis;
	const emojiSectionTitle = normalizedEmojiSearch ? "Search results" : currentEmojiCategory.label;
	const selectedAttachmentType = attachmentFile
		? getAttachmentTypeFromMimeType(attachmentFile.type, attachmentFile.name)
		: null;
	const selectedAttachmentPreview = attachmentFile
		? {
				type: selectedAttachmentType,
				mimeType: attachmentFile.type,
				fileName: attachmentFile.name,
				fileSize: attachmentFile.size,
		  }
		: null;
	const canPreviewSelectedAttachment = isImageAttachment(selectedAttachmentPreview) || isVideoAttachment(selectedAttachmentPreview);

	return (
		<form
			className='shrink-0 px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.55rem)] pt-1.5 sm:px-3 sm:pb-3 sm:pt-2 md:px-5 md:pb-4 lg:px-6'
			onSubmit={handleSubmit}
		>
			<div className='relative rounded-[22px] border border-white/10 bg-[#0b1428]/90 p-2 shadow-[0_16px_38px_rgba(2,6,23,0.2)] sm:rounded-[26px] sm:p-2.5 md:p-3'>
				<div>
					{repliedMessage ? (
						<div className='mb-2 flex items-start justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 sm:mb-2.5 sm:rounded-[22px] sm:px-3.5 sm:py-2.5'>
							<div className='min-w-0 flex-1'>
								<p className='text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300/75 sm:text-[11px] sm:tracking-[0.28em]'>
									Replying to message
								</p>
								<p className='custom-scrollbar mt-1 max-h-[44px] overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words text-xs text-slate-200 [overflow-wrap:anywhere] sm:mt-1.5 sm:max-h-[52px] sm:text-sm'>
									<FlagText text={getMessageSummaryText(repliedMessage)} />
								</p>
							</div>
							<button
								type='button'
								className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:h-8 sm:w-8'
								onClick={() => setRepliedMessage(null)}
								aria-label='Cancel reply'
							>
								<HiOutlineXMark className='h-5 w-5' />
							</button>
						</div>
					) : null}

					{attachmentFile ? (
						<div className='mb-2 flex items-start gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2.5 sm:mb-2.5 sm:rounded-[22px] sm:px-3.5 sm:py-3'>
							<div className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-white/10 bg-slate-950/45 text-slate-200'>
								{canPreviewSelectedAttachment && attachmentPreviewUrl ? (
									isImageAttachment(selectedAttachmentPreview) ? (
										<img src={attachmentPreviewUrl} alt={attachmentFile.name} className='h-full w-full object-cover' />
									) : (
										<video src={attachmentPreviewUrl} className='h-full w-full object-cover' muted playsInline />
									)
								) : isVideoAttachment(selectedAttachmentPreview) ? (
									<IoVideocamOutline className='h-6 w-6' />
								) : selectedAttachmentType === "IMAGE" ? (
									<IoImageOutline className='h-6 w-6' />
								) : (
									<IoDocumentOutline className='h-6 w-6' />
								)}
							</div>

							<div className='min-w-0 flex-1'>
								<p className='text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300/75 sm:text-[11px] sm:tracking-[0.28em]'>
									{getAttachmentKindLabel(selectedAttachmentPreview)} ready
								</p>
								<p className='mt-1 truncate text-sm font-medium text-slate-100'>{attachmentFile.name}</p>
								<p className='mt-1 text-xs text-slate-400'>
									{[getAttachmentKindLabel(selectedAttachmentPreview), formatAttachmentSize(attachmentFile.size)]
										.filter(Boolean)
										.join(" · ")}
								</p>
							</div>

							<button
								type='button'
								className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white sm:h-8 sm:w-8'
								onClick={clearSelectedAttachment}
								aria-label='Remove attachment'
							>
								<HiOutlineXMark className='h-5 w-5' />
							</button>
						</div>
					) : null}

					{!isRecording ? (
						<>
							<div className='relative flex items-end gap-2 sm:gap-3'>
								<div className='flex h-[58px] flex-1 items-center gap-2 rounded-[18px] border border-white/10 bg-slate-950/35 px-2.5 py-2 sm:h-[68px] sm:gap-2.5 sm:rounded-[22px] sm:px-3 sm:py-2.5'>
									<div className='flex shrink-0 items-center gap-2 self-center'>
										<button
											type='button'
											ref={emojiButtonRef}
											className={actionButtonClassName}
											onClick={() => setShowEmojiPicker((currentValue) => !currentValue)}
											aria-label={showEmojiPicker ? "Close emoji picker" : "Open emoji picker"}
											aria-expanded={showEmojiPicker}
										>
											<HiOutlineFaceSmile className='h-5 w-5' />
										</button>

										<input
											ref={attachmentInputRef}
											type='file'
											className='hidden'
											onChange={handleAttachmentSelect}
										/>

										<button
											type='button'
											className={actionButtonClassName}
											onClick={() => attachmentInputRef.current?.click()}
											disabled={loading || isRecording}
											aria-label='Attach image, video, PDF, or file'
											title='Attach image, video, PDF, or file'
										>
											<IoAttachOutline className='h-5 w-5' />
										</button>

										<button
											type='button'
											className={actionButtonClassName}
											onClick={startRecording}
											disabled={loading || isRecording || Boolean(attachmentFile)}
											aria-label='Record voice note'
										>
											<BsMic className='h-4 w-4' />
										</button>
									</div>

									<div className='relative h-11 flex-1 sm:h-[52px]'>
										<div className='pointer-events-none absolute inset-0 flex items-center overflow-hidden py-2 text-sm leading-6 md:text-[15px] sm:py-3'>
											{message ? (
												<div className='w-full overflow-hidden whitespace-pre-wrap break-words text-slate-100 [overflow-wrap:anywhere]'>
													<FlagText
														text={message}
														imgClassName='inline-block h-[1.05em] w-[1.05em] align-[-0.12em] object-contain'
													/>
												</div>
											) : (
												<span className='text-slate-500'>
													{isCompactViewport ? "Message..." : "Write a message..."}
												</span>
											)}
										</div>

										<textarea
											ref={textareaRef}
											rows='1'
											className='absolute inset-0 h-11 w-full resize-none overflow-hidden bg-transparent py-2 text-sm leading-6 text-transparent caret-slate-100 outline-none placeholder:text-transparent selection:bg-sky-500/25 md:text-[15px] sm:h-[52px] sm:py-3'
											placeholder={isCompactViewport ? "Message..." : "Write a message..."}
											value={message}
											onChange={(event) => {
												setMessage(event.target.value);
												handleTyping();
												adjustTextareaHeight();
											}}
											onKeyDown={(event) => {
												if (event.key === "Enter" && !event.shiftKey) {
													event.preventDefault();
													handleSubmit(event);
												}
											}}
											style={{
												height: `${isCompactViewport ? MOBILE_TEXTAREA_HEIGHT : DESKTOP_TEXTAREA_HEIGHT}px`,
												maxHeight: `${isCompactViewport ? MOBILE_TEXTAREA_HEIGHT : DESKTOP_TEXTAREA_HEIGHT}px`,
												overflowWrap: "anywhere",
											}}
										/>
									</div>
								</div>

								{showEmojiPicker ? (
									<div
										ref={emojiPanelRef}
										className='absolute bottom-full left-0 right-0 z-50 mb-3 overflow-hidden rounded-[22px] border border-white/10 bg-slate-900 shadow-[0_24px_48px_rgba(2,6,23,0.45)] sm:right-auto sm:w-[23rem]'
										style={emojiPanelStyle}
									>
										<div className='border-b border-white/10 p-3'>
											<div className='relative'>
												<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
												<input
													type='text'
													value={emojiSearch}
													onChange={(event) => setEmojiSearch(event.target.value)}
													placeholder='Search emoji'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-sky-400/40 focus:bg-white/[0.08]'
												/>
											</div>
										</div>

										<div
											ref={emojiScrollRef}
											className='custom-scrollbar overflow-y-auto px-3 pb-3 pt-2'
											style={emojiGridStyle}
										>
											<div className='mb-3 flex items-center justify-between'>
												<p className='text-sm font-semibold text-slate-100'>{emojiSectionTitle}</p>
												<p className='text-xs text-slate-400'>{visibleEmojis.length}</p>
											</div>

											{visibleEmojis.length ? (
												<div className='grid grid-cols-7 gap-2 sm:grid-cols-8'>
													{visibleEmojis.map((emoji) => (
														<button
															key={`${emoji.categoryId || activeEmojiCategory}-${emoji.id}`}
															type='button'
															className='inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.04] text-[1.35rem] transition hover:border-white/14 hover:bg-white/[0.1] sm:h-11 sm:w-11 sm:text-[1.5rem]'
															onClick={() => insertEmojiAtCursor(emoji.native)}
															title={emoji.name}
														>
															{emoji.categoryId === "flags" ? (
																<FlagEmoji
																	emoji={emoji}
																	className='h-6 w-6 object-contain sm:h-7 sm:w-7'
																/>
															) : (
																<span className='leading-none'>{emoji.native}</span>
															)}
														</button>
													))}
												</div>
											) : (
												<div className='rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													No emoji found for "{emojiSearch}"
												</div>
											)}
										</div>

										<div className='border-t border-white/10 px-2 py-2'>
											<div className='custom-scrollbar flex items-center gap-1 overflow-x-auto'>
												{EMOJI_CATEGORIES.map((category) => {
													const isActive = !normalizedEmojiSearch && activeEmojiCategory === category.id;
													return (
														<button
															key={category.id}
															type='button'
															className={`inline-flex h-10 min-w-10 items-center justify-center rounded-2xl px-2 text-lg transition ${
																isActive
																	? "bg-sky-500/18 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]"
																	: "text-slate-300 hover:bg-white/[0.06] hover:text-white"
															}`}
															onClick={() => {
																setEmojiSearch("");
																setActiveEmojiCategory(category.id);
															}}
															title={category.label}
															aria-label={category.label}
														>
															{category.icon}
														</button>
													);
												})}
											</div>
										</div>
									</div>
								) : null}

								<button
									type='submit'
									className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_16px_34px_rgba(14,165,233,0.24)] transition hover:translate-y-[-1px] hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70 sm:h-[52px] sm:w-[52px] sm:rounded-[18px]'
									disabled={loading || (!message.trim() && !attachmentFile)}
									aria-label='Send message'
								>
									{loading ? <span className='loading loading-spinner loading-sm'></span> : <HiOutlinePaperAirplane className='h-5 w-5 sm:h-6 sm:w-6' />}
								</button>
							</div>

						</>
					) : (
						<div className='overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,rgba(8,16,33,0.98),rgba(4,11,25,0.94))] px-3 py-3 shadow-[0_22px_48px_rgba(2,6,23,0.28)] sm:px-4 sm:py-4'>
						<div className='flex justify-end'>
							<div className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-slate-100 sm:text-sm'>
								<IoRadioOutline className={`h-4 w-4 ${isPaused ? "text-amber-300" : "text-emerald-300"}`} />
								{formatTime(recordingTime)}
							</div>
						</div>

						<div className='mt-3 space-y-3'>
							<div className='relative overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/38 px-3 py-3'>
								<div className='pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-white/6'></div>

								<div className='relative flex h-[44px] items-center justify-between gap-[3px] sm:h-[48px]'>
									{audioLevels.map((level, index) => {
										const normalizedLevel = Math.max(0.16, Math.min(level / 120, 1));
										const barHeight = Math.round((isCompactViewport ? 8 : 10) + normalizedLevel * (isCompactViewport ? 18 : 22));
										const barOpacity = isPaused ? 0.4 : 0.42 + normalizedLevel * 0.52;
										const isStrongPeak = normalizedLevel > 0.72;

										return (
											<span
												key={index}
												className={`rounded-full transition-all duration-150 ${
													isPaused
														? "bg-amber-200/70"
														: isStrongPeak
															? "bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.22)]"
															: "bg-sky-100/90"
												}`}
												style={{
													height: `${barHeight}px`,
													width: isCompactViewport ? "4px" : "5px",
													opacity: barOpacity,
												}}
											></span>
										);
									})}
								</div>

								<div className='mt-2 flex items-center justify-between text-[10px] text-slate-400 sm:text-[11px]'>
									<span className='inline-flex items-center gap-1.5 text-slate-300'>
										<IoPulseOutline className='h-3.5 w-3.5 text-cyan-200' />
										Waveform
									</span>
									<span>{isPaused ? "Paused" : "Live"}</span>
								</div>
							</div>

							<div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
								<div className='flex flex-wrap items-center gap-2'>
									<div
										className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] border border-white/10 ${
											isPaused ? "bg-amber-400/10" : "bg-rose-500/10"
										}`}
									>
										<div
											className={`absolute inset-2 rounded-full blur-xl ${
												isPaused ? "bg-amber-300/18" : "bg-rose-400/22"
											}`}
										></div>
										<BsMic className={`relative h-3.5 w-3.5 ${isPaused ? "text-amber-100" : "text-rose-100"}`} />
									</div>

									<span
										className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
											isPaused
												? "border-amber-300/20 bg-amber-400/10 text-amber-50"
												: "border-rose-400/20 bg-rose-500/10 text-rose-50"
										}`}
									>
										<span
											className={`h-2 w-2 rounded-full ${
												isPaused ? "bg-amber-300" : "bg-rose-400 animate-pulse"
											}`}
										></span>
										{isPaused ? "Paused" : "Live capture"}
									</span>

									<span className='inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-medium text-cyan-100 sm:text-[11px]'>
										<IoPulseOutline className='h-3.5 w-3.5' />
										{inputStrengthLabel}
									</span>
								</div>

								<div className='flex flex-col gap-2 sm:flex-row'>
									<button
										type='button'
										className='inline-flex items-center justify-center gap-2 rounded-full border border-rose-400/18 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/16'
										onClick={(event) => {
											event.preventDefault();
											deleteRecording();
										}}
									>
										<BsTrash className='h-4 w-4' />
										Delete
									</button>

									<button
										type='button'
										className='inline-flex items-center justify-center gap-2 rounded-full border border-amber-300/18 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/16'
										onClick={() => (isPaused ? resumeRecording() : pauseRecording())}
									>
										{isPaused ? <BsMic className='h-4 w-4' /> : <BsPauseFill className='h-4 w-4' />}
										{isPaused ? "Resume" : "Pause"}
									</button>

									<button
										type='button'
										className='inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400'
										onClick={stopRecording}
									>
										<BsSend className='h-4 w-4' />
										Send voice note
									</button>
								</div>
							</div>
						</div>
						</div>
					)}
				</div>

			</div>
		</form>
	);
};

export default MessageInput;
