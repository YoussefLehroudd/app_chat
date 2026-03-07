import { IoClose, IoSearchSharp } from "react-icons/io5";

const SearchInput = ({ value, onChange, onClear, totalCount, visibleCount, activeFilter }) => {
	const summaryLabel =
		activeFilter === "online"
			? `${visibleCount} online contact${visibleCount === 1 ? "" : "s"}`
			: `${visibleCount} of ${totalCount} contact${totalCount === 1 ? "" : "s"}`;

	return (
		<div className='space-y-3'>
			<div className='flex items-center gap-3 rounded-[24px] border border-white/10 bg-slate-950/45 px-4 py-3 shadow-[0_18px_32px_rgba(2,6,23,0.22)] backdrop-blur-xl transition focus-within:border-sky-400/45 focus-within:bg-slate-950/65'>
				<IoSearchSharp className='h-5 w-5 shrink-0 text-slate-400' />
				<input
					type='text'
					placeholder='Search people, usernames or bios'
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

			<div className='flex items-center justify-between gap-3 text-xs text-slate-400'>
				<p>{summaryLabel}</p>
				{value ? <p className='truncate text-slate-500'>Filtering for "{value}"</p> : null}
			</div>
		</div>
	);
};

export default SearchInput;
