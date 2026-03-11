import { IoClose, IoSearchSharp } from "react-icons/io5";

const SearchInput = ({
	value,
	onChange,
	onClear,
	totalCount,
	visibleCount,
	activeFilter,
	showSummary = true,
	compact = false,
}) => {
	const summaryLabel =
		activeFilter === "online"
			? `${visibleCount} online contact${visibleCount === 1 ? "" : "s"}`
			: activeFilter === "calls"
				? `${visibleCount} of ${totalCount} call${totalCount === 1 ? "" : "s"}`
				: `${visibleCount} of ${totalCount} contact${totalCount === 1 ? "" : "s"}`;

	return (
		<div className={compact ? "space-y-0" : "space-y-2.5"}>
			<div
				className={`flex items-center gap-3 border border-white/10 bg-slate-950/45 shadow-[0_18px_32px_rgba(2,6,23,0.22)] backdrop-blur-xl transition focus-within:border-sky-400/45 focus-within:bg-slate-950/65 ${
					compact ? "rounded-full px-3 py-2" : "rounded-[22px] px-3.5 py-2.5"
				}`}
			>
				<IoSearchSharp className='h-5 w-5 shrink-0 text-slate-400' />
				<input
					type='text'
					placeholder={
						compact
							? activeFilter === "calls"
								? "Search calls..."
								: "Search people..."
							: activeFilter === "calls"
								? "Search calls, people or live sessions"
								: "Search people, usernames or bios"
					}
					className='w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500'
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				{value ? (
					<button
						type='button'
						onClick={onClear}
						className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white'
						aria-label='Clear search'
					>
						<IoClose className='h-4 w-4' />
					</button>
				) : null}
			</div>

			{showSummary ? (
				<div className='flex items-center justify-between gap-3 text-xs text-slate-400'>
					<p>{summaryLabel}</p>
					{value ? <p className='truncate text-slate-500'>Filtering for "{value}"</p> : null}
				</div>
			) : null}
		</div>
	);
};

export default SearchInput;
