import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlinePhoto, HiOutlineVideoCamera, HiOutlineXMark } from "react-icons/hi2";

const StoryComposerModal = ({ open, onClose, onSubmit, isSubmitting = false }) => {
	const fileInputRef = useRef(null);
	const [text, setText] = useState("");
	const [selectedFile, setSelectedFile] = useState(null);

	useEffect(() => {
		if (!open) {
			setText("");
			setSelectedFile(null);
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

	if (!open) return null;

	const isVideo = Boolean(selectedFile?.type?.startsWith("video/"));
	const canSubmit = Boolean(text.trim() || selectedFile);

	const handleFilePick = (event) => {
		const nextFile = event.target.files?.[0] || null;
		if (!nextFile) {
			setSelectedFile(null);
			return;
		}

		if (!nextFile.type.startsWith("image/") && !nextFile.type.startsWith("video/")) {
			return;
		}

		setSelectedFile(nextFile);
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		if (!canSubmit || isSubmitting) return;

		const result = await onSubmit?.({
			text,
			file: selectedFile,
		});

		if (result?.ok) {
			onClose?.();
		}
	};

	return (
		<div
			className='fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/82 p-3 backdrop-blur-md sm:p-6'
			onClick={onClose}
		>
			<div
				className='w-full max-w-xl overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(2,8,23,0.98),rgba(8,18,34,0.96))] shadow-[0_36px_90px_rgba(2,6,23,0.65)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='flex items-start justify-between border-b border-white/10 px-5 py-5 sm:px-6'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75'>Story</p>
						<h3 className='mt-2 text-xl font-semibold text-white sm:text-2xl'>Share a new moment</h3>
					</div>
					<button
						type='button'
						onClick={onClose}
						className='inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white'
					>
						<HiOutlineXMark className='h-5 w-5' />
					</button>
				</div>

				<form className='space-y-4 px-5 py-5 sm:px-6 sm:py-6' onSubmit={handleSubmit}>
					<label className='block'>
						<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Caption</span>
						<textarea
							rows='4'
							value={text}
							onChange={(event) => setText(event.target.value)}
							maxLength={700}
							placeholder='What are you up to?'
							className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35 focus:bg-white/[0.06]'
						/>
						<p className='mt-2 text-right text-[11px] text-slate-500'>{text.length}/700</p>
					</label>

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
									<video src={previewUrl} controls className='max-h-[280px] w-full object-cover' />
								) : (
									<img src={previewUrl} alt='Story preview' className='max-h-[280px] w-full object-cover' />
								)}
								<button
									type='button'
									onClick={() => {
										setSelectedFile(null);
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
								Image or video
							</span>
						</div>
					</div>

					<div className='flex justify-end gap-2'>
						<button
							type='button'
							onClick={onClose}
							className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white'
						>
							Cancel
						</button>
						<button
							type='submit'
							disabled={!canSubmit || isSubmitting}
							className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
						>
							{isSubmitting ? "Posting..." : "Post story"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default StoryComposerModal;
