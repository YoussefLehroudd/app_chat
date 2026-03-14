import { useEffect, useRef } from "react";
import { HiOutlineBellAlert, HiOutlineMegaphone, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";

const AUDIENCE_LABELS = {
	ALL_USERS: "All users",
	ACTIVE_USERS: "Active users",
	VERIFIED_USERS: "Verified",
	UNVERIFIED_USERS: "Unverified",
	DEVELOPERS: "Developers",
};

const formatBroadcastTime = (value) => {
	const parsedValue = new Date(value);
	if (!Number.isFinite(parsedValue.getTime())) return "Just now";

	const diffInMs = Date.now() - parsedValue.getTime();
	const diffInMinutes = Math.floor(diffInMs / 60000);

	if (diffInMinutes <= 0) return "Just now";
	if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) return `${diffInHours}h ago`;

	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 7) return `${diffInDays}d ago`;

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(parsedValue);
};

const BroadcastInboxPanel = ({ open, unreadCount, announcements, onClose, onDismiss, onClear }) => {
	const panelRef = useRef(null);

	useEffect(() => {
		if (!open) return undefined;

		const handlePointerDown = (event) => {
			if (panelRef.current && !panelRef.current.contains(event.target)) {
				onClose();
			}
		};

		const handleEscape = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleEscape);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose, open]);

	if (!open) return null;

	return (
		<div
			ref={panelRef}
			className='absolute bottom-full left-0 right-0 z-30 mb-3 flex max-h-[min(30rem,calc(100dvh-10rem))] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,23,0.98),rgba(3,8,20,0.98))] shadow-[0_22px_64px_rgba(2,6,23,0.58)]'
			role='dialog'
			aria-label='Announcements inbox'
		>
			<div className='border-b border-white/10 px-4 py-4'>
				<div className='flex items-start justify-between gap-3'>
					<div className='min-w-0'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-200/70'>Updates</p>
						<div className='mt-2 flex items-center gap-2'>
							<h3 className='text-base font-semibold text-white'>Announcements</h3>
							<span className='rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-100'>
								{unreadCount} unread
							</span>
						</div>
					</div>
					<div className='flex items-center gap-2'>
						<button
							type='button'
							onClick={onClear}
							disabled={announcements.length === 0}
							className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45'
							aria-label='Clear announcements'
							title='Clear announcements'
						>
							<HiOutlineTrash className='h-[18px] w-[18px]' />
						</button>
						<button
							type='button'
							onClick={onClose}
							className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300 transition hover:border-white/20 hover:text-white'
							aria-label='Close announcements'
						>
							<HiOutlineXMark className='h-5 w-5' />
						</button>
					</div>
				</div>
			</div>

			{announcements.length > 0 ? (
				<div className='chat-scrollbar min-h-0 flex-1 overflow-y-auto p-3'>
					<div className='space-y-3'>
						{announcements.map((announcement) => (
							<article
								key={announcement.id}
								className={`rounded-[24px] border p-3 transition ${
									announcement.isRead
										? "border-white/10 bg-white/[0.03]"
										: "border-cyan-300/25 bg-cyan-500/[0.08] shadow-[0_12px_28px_rgba(34,211,238,0.08)]"
								}`}
							>
								<div className='flex items-start gap-3'>
									<div className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-cyan-100'>
										<HiOutlineMegaphone className='h-5 w-5' />
									</div>
									<div className='min-w-0 flex-1'>
										<div className='flex flex-wrap items-center gap-2'>
											<p className='truncate text-sm font-semibold text-white'>{announcement.title}</p>
											<span className='rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300'>
												{AUDIENCE_LABELS[announcement.audienceType] || "Audience"}
											</span>
										</div>
										<p className='mt-2 whitespace-pre-line text-sm leading-6 text-slate-300'>{announcement.content}</p>
										<div className='mt-3 flex items-center justify-between gap-3'>
											<p className='text-[11px] uppercase tracking-[0.24em] text-slate-500'>
												{formatBroadcastTime(announcement.sentAt)}
											</p>
											<button
												type='button'
												onClick={() => onDismiss(announcement.id)}
												className='inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white'
											>
												<HiOutlineXMark className='h-3.5 w-3.5' />
												Dismiss
											</button>
										</div>
									</div>
								</div>
							</article>
						))}
					</div>
				</div>
			) : (
				<div className='p-4'>
					<div className='rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-center'>
						<div className='mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-cyan-100'>
							<HiOutlineBellAlert className='h-6 w-6' />
						</div>
						<p className='mt-4 text-sm font-semibold text-white'>No announcements yet</p>
						<p className='mt-2 text-sm leading-6 text-slate-400'>
							Platform updates from the developer team will appear here as soon as they are sent.
						</p>
					</div>
				</div>
			)}
		</div>
	);
};

export default BroadcastInboxPanel;
