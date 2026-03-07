import { IoCheckmarkSharp } from "react-icons/io5";

const VerifiedBadge = ({ user, compact = false, showLabel = false, className = "" }) => {
	if (!user?.isVerified) return null;

	if (showLabel) {
		return (
			<span
				className={`inline-flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(6,182,212,0.14))] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-50 shadow-[0_12px_28px_rgba(14,165,233,0.14)] ${className}`}
				title='Verified account'
				aria-label='Verified account'
			>
				<span className='inline-flex h-4 w-4 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(59,130,246,1),rgba(6,182,212,1))] text-white shadow-[0_6px_14px_rgba(14,165,233,0.24)]'>
					<IoCheckmarkSharp className='h-2.5 w-2.5' />
				</span>
				<span>Verified</span>
			</span>
		);
	}

	return (
		<span
			className={`inline-flex items-center justify-center rounded-full border border-sky-300/35 bg-[linear-gradient(135deg,rgba(59,130,246,0.98),rgba(6,182,212,0.92))] text-white shadow-[0_10px_24px_rgba(14,165,233,0.24)] ${
				compact ? "h-5 w-5" : "h-6 w-6"
			} ${className}`}
			title='Verified account'
			aria-label='Verified account'
		>
			<IoCheckmarkSharp className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
		</span>
	);
};

export default VerifiedBadge;
