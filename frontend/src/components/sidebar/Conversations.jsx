import Conversation from "./Conversation";

const ConversationSkeleton = () => {
	return (
		<div className='rounded-[26px] border border-white/8 bg-white/[0.035] p-3.5'>
			<div className='flex items-center gap-3'>
				<div className='h-12 w-12 rounded-full bg-slate-700/60 animate-pulse'></div>
				<div className='min-w-0 flex-1 space-y-2'>
					<div className='h-4 w-32 rounded bg-slate-700/60 animate-pulse'></div>
					<div className='h-3 w-full max-w-[180px] rounded bg-slate-800/70 animate-pulse'></div>
				</div>
				<div className='h-3 w-10 rounded bg-slate-800/70 animate-pulse'></div>
			</div>
		</div>
	);
};

const Conversations = ({ loading, conversations, emptyTitle, emptyDescription }) => {
	const showSkeletons = loading && conversations.length === 0;

	return (
		<div className='min-h-0 flex-1 overflow-hidden'>
			<div className='custom-scrollbar flex h-full flex-col gap-2.5 overflow-y-auto pr-1'>
				{showSkeletons
					? Array.from({ length: 6 }).map((_, idx) => <ConversationSkeleton key={`skeleton-${idx}`} />)
					: null}

				{!showSkeletons &&
					conversations.map((conversation) => <Conversation key={conversation._id} conversation={conversation} />)}

				{!loading && conversations.length === 0 ? (
					<div className='flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-slate-950/35 px-6 text-center'>
						<p className='text-base font-semibold text-slate-100'>{emptyTitle}</p>
						<p className='mt-2 max-w-xs text-sm leading-6 text-slate-400'>{emptyDescription}</p>
					</div>
				) : null}

				{loading && !showSkeletons ? <span className='loading loading-spinner mx-auto mt-4'></span> : null}
			</div>
		</div>
	);
};

export default Conversations;
