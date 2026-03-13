import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { HiOutlinePhoto, HiOutlineVideoCamera, HiOutlineXMark } from "react-icons/hi2";
import useModalBodyScrollLock from "../../hooks/useModalBodyScrollLock";

const MAX_STORY_VIDEO_DURATION_SECONDS = 30;
const MAX_STORY_UPLOAD_BYTES = 100 * 1024 * 1024;

const formatDurationLabel = (value) => {
	const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const StoryComposerModal = ({ open, onClose, onSubmit, isSubmitting = false }) => {
	const fileInputRef = useRef(null);
	const videoPreviewRef = useRef(null);
	const [text, setText] = useState("");
	const [selectedFile, setSelectedFile] = useState(null);
	const [videoDurationSeconds, setVideoDurationSeconds] = useState(0);
	const [clipStartSeconds, setClipStartSeconds] = useState(0);
	useModalBodyScrollLock(open);

	useEffect(() => {
		if (!open) {
			setText("");
			setSelectedFile(null);
			setVideoDurationSeconds(0);
			setClipStartSeconds(0);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return undefined;

		const onKeyDown = (event) => {
			if (event.key === "Escape") {
				onClose?.();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, open]);

	const previewUrl = useMemo(() => {
		if (!selectedFile) return "";
		return URL.createObjectURL(selectedFile);
	}, [selectedFile]);

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	const isVideo = Boolean(selectedFile?.type?.startsWith("video/"));
	const maxClipStartSeconds = isVideo
		? Math.max(0, videoDurationSeconds - MAX_STORY_VIDEO_DURATION_SECONDS)
		: 0;
	const clipDurationSeconds = isVideo
		? Math.max(
				1,
				Math.min(
					MAX_STORY_VIDEO_DURATION_SECONDS,
					videoDurationSeconds > 0 ? Math.max(videoDurationSeconds - clipStartSeconds, 0) : MAX_STORY_VIDEO_DURATION_SECONDS
				)
			)
		: null;
	const clipEndSeconds = isVideo ? clipStartSeconds + (clipDurationSeconds || 0) : 0;
	const needsVideoTrim = isVideo && videoDurationSeconds > MAX_STORY_VIDEO_DURATION_SECONDS;
	const canSubmit = Boolean(text.trim() || selectedFile);

	const handleFilePick = (event) => {
		const nextFile = event.target.files?.[0] || null;
		if (!nextFile) {
			setSelectedFile(null);
			setVideoDurationSeconds(0);
			setClipStartSeconds(0);
			return;
		}

		if (!nextFile.type.startsWith("image/") && !nextFile.type.startsWith("video/")) {
			toast.error("Choose an image or video file");
			event.target.value = "";
			return;
		}

		if (nextFile.size > MAX_STORY_UPLOAD_BYTES) {
			toast.error("Story video is too large. Max 100 MB before trimming.");
			event.target.value = "";
			return;
		}

		setSelectedFile(nextFile);
		setVideoDurationSeconds(0);
		setClipStartSeconds(0);
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		if (!canSubmit || isSubmitting) return;

		const result = await onSubmit?.({
			text,
			file: selectedFile,
			clipStartSeconds: isVideo ? clipStartSeconds : 0,
			clipDurationSeconds: isVideo ? clipDurationSeconds : null,
		});

		if (result?.ok) {
			onClose?.();
		}
	};

	useEffect(() => {
		if (!isVideo) {
			setVideoDurationSeconds(0);
			setClipStartSeconds(0);
		}
	}, [isVideo]);

	useEffect(() => {
		if (!isVideo) return undefined;

		const activeVideo = videoPreviewRef.current;
		if (!activeVideo) return undefined;

		const handleTimeUpdate = () => {
			if (!needsVideoTrim) return;
			if (activeVideo.currentTime >= clipEndSeconds - 0.05) {
				activeVideo.pause();
			}
		};

		const handlePlay = () => {
			if (!needsVideoTrim) return;
			if (activeVideo.currentTime < clipStartSeconds || activeVideo.currentTime >= clipEndSeconds) {
				activeVideo.currentTime = clipStartSeconds;
			}
		};

		activeVideo.addEventListener("timeupdate", handleTimeUpdate);
		activeVideo.addEventListener("play", handlePlay);
		return () => {
			activeVideo.removeEventListener("timeupdate", handleTimeUpdate);
			activeVideo.removeEventListener("play", handlePlay);
		};
	}, [clipEndSeconds, clipStartSeconds, isVideo, needsVideoTrim]);

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-950/82 px-3 py-3 sm:px-6 sm:py-6'
			onClick={onClose}
		>
			<div
				className='my-auto flex w-full max-w-xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(2,8,23,0.98),rgba(8,18,34,0.96))] shadow-[0_36px_90px_rgba(2,6,23,0.65)] sm:max-h-[calc(100dvh-3rem)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='shrink-0 border-b border-white/10 px-5 py-5 sm:px-6'>
					<div className='flex items-start justify-between gap-4'>
						<div>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75'>Story</p>
							<h3 className='mt-2 text-xl font-semibold text-white sm:text-2xl'>Share a new moment</h3>
						</div>
						<button
							type='button'
							onClick={onClose}
							className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white'
						>
							<HiOutlineXMark className='h-5 w-5' />
						</button>
					</div>
				</div>

				<form className='min-h-0 flex flex-1 flex-col' onSubmit={handleSubmit}>
					<div className='custom-scrollbar modal-scroll-region min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6'>
					<div>
						<label className='block'>
							<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Caption</span>
							<textarea
								rows='4'
								value={text}
								onChange={(event) => setText(event.target.value)}
								maxLength={700}
								placeholder='What are you up to?'
								className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/35 focus:bg-white/[0.06]'
							/>
							<p className='mt-2 text-right text-[11px] text-slate-500'>{text.length}/700</p>
						</label>
					</div>

					<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
						<input
							ref={fileInputRef}
							type='file'
							accept='image/*,video/*'
							className='hidden'
							onChange={handleFilePick}
						/>
						{selectedFile && previewUrl ? (
							<div className='relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40'>
								{isVideo ? (
									<video
										ref={videoPreviewRef}
										src={previewUrl}
										controls
										className='max-h-[280px] w-full object-cover'
										onLoadedMetadata={(event) => {
											const durationSeconds = event.currentTarget.duration;
											if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
												setVideoDurationSeconds(0);
												return;
											}

											setVideoDurationSeconds(durationSeconds);
											if (clipStartSeconds > 0) {
												event.currentTarget.currentTime = Math.min(clipStartSeconds, durationSeconds);
											}
										}}
									/>
								) : (
									<img
										src={previewUrl}
										alt='Story preview'
										decoding='async'
										className='max-h-[280px] w-full object-cover'
									/>
								)}
								<button
									type='button'
									onClick={() => {
										setSelectedFile(null);
										setVideoDurationSeconds(0);
										setClipStartSeconds(0);
										if (fileInputRef.current) {
											fileInputRef.current.value = "";
										}
									}}
									className='absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-900/70 text-white transition hover:bg-slate-900'
									aria-label='Remove selected file'
								>
									<HiOutlineXMark className='h-4 w-4' />
								</button>
							</div>
						) : (
							<div className='rounded-2xl border border-dashed border-white/15 bg-slate-950/35 px-4 py-8 text-center'>
								<p className='text-sm text-slate-300'>Add an image or video (optional)</p>
								<p className='mt-1 text-xs text-slate-500'>Stories disappear after 24 hours</p>
							</div>
						)}

						<div className='mt-3 flex flex-wrap gap-2'>
							<button
								type='button'
								onClick={() => fileInputRef.current?.click()}
								className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/16'
							>
								<HiOutlinePhoto className='h-4 w-4' />
								<span>Choose media</span>
							</button>
							<span className='inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-slate-400'>
								<HiOutlineVideoCamera className='h-4 w-4' />
								Video max 30s
							</span>
						</div>

						{isVideo ? (
							<div className='mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-3'>
								<div className='flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300'>
									<p>
										Video length:
										<span className='ml-1 font-semibold text-white'>
											{videoDurationSeconds > 0 ? formatDurationLabel(videoDurationSeconds) : "Loading..."}
										</span>
									</p>
									<p className='text-cyan-100'>Stories keep up to {MAX_STORY_VIDEO_DURATION_SECONDS}s</p>
								</div>

								{needsVideoTrim ? (
									<div className='mt-3 space-y-3'>
										<div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
											<p className='text-slate-300'>Choose where the 30s story should start.</p>
											<p className='font-semibold text-white'>
												{formatDurationLabel(clipStartSeconds)} - {formatDurationLabel(clipEndSeconds)}
											</p>
										</div>
										<input
											type='range'
											min='0'
											max={Math.max(maxClipStartSeconds, 0)}
											step='0.1'
											value={clipStartSeconds}
											onChange={(event) => {
												const nextValue = Number(event.target.value);
												setClipStartSeconds(nextValue);
												if (videoPreviewRef.current) {
													videoPreviewRef.current.currentTime = nextValue;
												}
											}}
											className='w-full accent-cyan-400'
										/>
										<p className='text-[11px] text-slate-500'>
											The selected clip will be uploaded from your chosen moment, not from the beginning.
										</p>
									</div>
								) : (
									<p className='mt-3 text-[11px] text-slate-500'>
										This video is already short enough, so the full clip will be posted.
									</p>
								)}
							</div>
						) : null}
					</div>
					</div>

					<div className='shrink-0 border-t border-white/10 px-5 py-4 sm:px-6'>
						<div className='flex justify-end gap-2'>
						<button
							type='button'
							onClick={onClose}
							className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-slate-300 hover:bg-white/[0.08] hover:text-white'
						>
							Cancel
						</button>
						<button
							type='submit'
							disabled={!canSubmit || isSubmitting}
							className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(14,165,233,0.28)] hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
						>
							{isSubmitting ? "Posting..." : "Post story"}
						</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
};

export default StoryComposerModal;
