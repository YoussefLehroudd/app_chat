import { IoEyeOutline, IoGlobeOutline, IoLockClosedOutline, IoTrashOutline } from "react-icons/io5";
import { formatDeveloperDateTime, getModerationMessageText } from "./developerDashboardShared";

const DeveloperGroupsPage = ({
	loading,
	filteredGroups,
	groupSearchValue,
	setGroupSearchValue,
	groupTotals,
	actionKey,
	handleInspectGroup,
	openDeleteGroupPopup,
	canDeleteGroups,
}) => {
	return (
		<div className='w-full min-w-0 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6 lg:p-7'>
			<div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
				<div>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Group control</p>
					<h2 className='mt-2 text-2xl font-semibold text-white'>Inspect every group chat</h2>
					<p className='mt-2 max-w-3xl text-sm leading-7 text-slate-400'>
						Review private and public groups, see members and recent activity, delete abusive group
						messages, or remove an entire group when moderation requires it.
					</p>
				</div>

				<input
					type='text'
					value={groupSearchValue}
					onChange={(event) => setGroupSearchValue(event.target.value)}
					placeholder='Search groups'
					className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55 lg:max-w-[280px]'
				/>
			</div>

			<div className='mt-4 flex flex-wrap items-center gap-2 text-xs'>
				<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-medium text-slate-300'>
					{groupTotals.total} total groups
				</span>
				<span className='inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-100'>
					<IoGlobeOutline className='h-3.5 w-3.5' />
					{groupTotals.publicCount} public
				</span>
				<span className='inline-flex items-center gap-1 rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 font-medium text-rose-100'>
					<IoLockClosedOutline className='h-3.5 w-3.5' />
					{groupTotals.privateCount} private
				</span>
			</div>

			<div className='mt-5 space-y-3'>
				{filteredGroups.map((group) => {
					const isDeletingGroup = actionKey === `delete-group-${group._id}`;

					return (
						<div
							key={group._id}
							className={`rounded-[20px] border p-3.5 transition hover:bg-white/[0.04] sm:rounded-[24px] sm:p-4 ${
								group.isPrivate
									? "border-rose-400/16 bg-rose-500/[0.035] hover:border-rose-400/28"
									: "border-emerald-400/16 bg-emerald-500/[0.03] hover:border-emerald-400/28"
							}`}
						>
							<div className='flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between'>
								<div className='min-w-0'>
									<div className='flex flex-wrap items-center gap-2'>
										<p className='truncate text-base font-semibold text-white sm:text-lg'>{group.title}</p>
										<span
											className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
												group.isPrivate
													? "border-rose-300/20 bg-rose-500/10 text-rose-100"
													: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
											}`}
										>
											{group.isPrivate ? "PRIVATE" : "PUBLIC"}
										</span>
										{group.owner?.fullName ? (
											<span className='rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-slate-300'>
												Owner {group.owner.fullName}
											</span>
										) : null}
									</div>
									<p className='mt-2 break-words text-sm leading-7 text-slate-400'>
										{group.description?.trim() || "No group description yet."}
									</p>
									<div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500'>
										<span>{group.memberCount} members</span>
										<span>{group.messageCount} messages</span>
										<span>{group.memberLimit ? `${group.memberCount}/${group.memberLimit} capacity` : "No member limit"}</span>
										<span>{formatDeveloperDateTime(group.latestActivityAt || group.createdAt)}</span>
									</div>
									<p className='mt-3 break-words text-sm text-slate-300'>
										Latest activity: {getModerationMessageText(group.latestMessage)}
									</p>
								</div>

								<div className='grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center'>
									<button
										type='button'
										onClick={() => handleInspectGroup(group)}
										disabled={isDeletingGroup}
										className='inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'
									>
										<IoEyeOutline className='h-4 w-4' />
										Inspect
									</button>
									<button
										type='button'
										onClick={() => openDeleteGroupPopup(group)}
										disabled={!canDeleteGroups || isDeletingGroup}
										className='inline-flex w-full items-center justify-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'
									>
										<IoTrashOutline className='h-4 w-4' />
										{isDeletingGroup ? "Deleting..." : "Delete group"}
									</button>
								</div>
							</div>
						</div>
					);
				})}

				{!loading && filteredGroups.length === 0 ? (
					<div className='rounded-[24px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-6 text-sm text-slate-400'>
						No groups match this search.
					</div>
				) : null}
			</div>
		</div>
	);
};

export default DeveloperGroupsPage;
