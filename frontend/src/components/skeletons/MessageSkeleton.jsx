const MessageSkeleton = () => {
	return (
		<div className='space-y-3'>
			<div className='flex items-end gap-3'>
				<div className='h-10 w-10 shrink-0 rounded-full bg-slate-700/60 animate-pulse'></div>
				<div className='max-w-[260px] flex-1 rounded-[24px] border border-white/6 bg-white/[0.03] p-3'>
					<div className='h-3 w-40 rounded bg-slate-700/60 animate-pulse'></div>
					<div className='mt-2 h-3 w-28 rounded bg-slate-800/70 animate-pulse'></div>
				</div>
			</div>

			<div className='flex items-end justify-end gap-3'>
				<div className='max-w-[220px] flex-1 rounded-[24px] border border-sky-400/10 bg-sky-500/10 p-3'>
					<div className='ml-auto h-3 w-32 rounded bg-sky-300/25 animate-pulse'></div>
					<div className='mt-2 ml-auto h-3 w-20 rounded bg-sky-200/20 animate-pulse'></div>
				</div>
				<div className='h-10 w-10 shrink-0 rounded-full bg-slate-700/60 animate-pulse'></div>
			</div>
		</div>
	);
};

export default MessageSkeleton;
