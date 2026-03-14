import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { HiOutlineLink, HiOutlineXMark } from "react-icons/hi2";
import useModalBodyScrollLock from "../../hooks/useModalBodyScrollLock";

const JoinGroupLinkModal = ({ open, onClose, onJoin }) => {
	const [inviteLink, setInviteLink] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useModalBodyScrollLock(open);

	useEffect(() => {
		if (!open) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	useEffect(() => {
		if (!open) {
			setInviteLink("");
			setIsSubmitting(false);
		}
	}, [open]);

	const handleSubmit = async (event) => {
		event.preventDefault();
		const normalizedInviteLink = inviteLink.trim();
		if (!normalizedInviteLink) {
			toast.error("Paste a group invite link or code");
			return;
		}

		setIsSubmitting(true);
		try {
			const didJoin = await onJoin?.(normalizedInviteLink);
			if (didJoin !== false) {
				onClose();
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	if (!open) return null;

	return (
		<div className='fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/78 p-3 sm:p-5' onClick={onClose}>
			<div
				className='w-full max-w-xl rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(10,18,36,0.96))] shadow-[0_32px_80px_rgba(2,6,23,0.55)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6'>
					<div className='flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/75'>Join group</p>
							<h2 className='mt-2 text-2xl font-semibold text-white sm:text-[2rem]'>Open a group from a link</h2>
							<p className='mt-2 max-w-xl text-sm leading-6 text-slate-400'>
								Paste the invite URL or just the code. Private groups will send a join request automatically.
							</p>
						</div>
						<button
							type='button'
							className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white'
							onClick={onClose}
						>
							<HiOutlineXMark className='h-5 w-5' />
						</button>
					</div>
				</div>

				<form className='px-5 py-5 sm:px-6 sm:py-6' onSubmit={handleSubmit}>
					<label className='block'>
						<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Invite link or code</span>
						<div className='relative'>
							<HiOutlineLink className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
							<input
								type='text'
								value={inviteLink}
								onChange={(event) => setInviteLink(event.target.value)}
								placeholder='https://your-app.com/?groupInvite=...'
								className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-12 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/30 focus:bg-white/[0.06]'
								autoFocus
							/>
						</div>
					</label>

					<div className='mt-4 rounded-[24px] border border-cyan-300/15 bg-cyan-500/8 px-4 py-4'>
						<p className='text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/80'>How it works</p>
						<p className='mt-2 text-sm leading-6 text-slate-300'>
							Public groups open instantly. Private groups create a pending request for moderators to approve.
						</p>
					</div>

					<div className='mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
						<button
							type='button'
							onClick={onClose}
							className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:bg-white/[0.08]'
						>
							Cancel
						</button>
						<button
							type='submit'
							className='rounded-full border border-cyan-300/20 bg-cyan-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
							disabled={isSubmitting}
						>
							{isSubmitting ? "Joining..." : "Join group"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default JoinGroupLinkModal;
