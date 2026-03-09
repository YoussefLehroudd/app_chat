import { useMemo, useState } from "react";
import { formatDeveloperDateTime } from "./developerDashboardShared";

const entityToneByType = {
	USER: "border-sky-300/20 bg-sky-500/10 text-sky-100",
	GROUP: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
	MESSAGE: "border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-100",
	REPORT: "border-amber-300/20 bg-amber-400/10 text-amber-100",
};

const DeveloperAuditLogsPage = ({ loading, auditLogs }) => {
	const [searchValue, setSearchValue] = useState("");
	const [entityFilter, setEntityFilter] = useState("ALL");

	const entityCounts = useMemo(
		() =>
			auditLogs.reduce((accumulator, log) => {
				const key = log.entityType || "OTHER";
				accumulator[key] = (accumulator[key] || 0) + 1;
				return accumulator;
			}, {}),
		[auditLogs]
	);

	const filteredLogs = useMemo(() => {
		const normalizedQuery = searchValue.trim().toLowerCase();

		return auditLogs.filter((log) => {
			if (entityFilter !== "ALL" && log.entityType !== entityFilter) {
				return false;
			}

			if (!normalizedQuery) return true;

			return [log.summary, log.action, log.entityType, log.entityLabel, log.actor?.fullName]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	}, [auditLogs, entityFilter, searchValue]);

	const entityFilters = ["ALL", ...Object.keys(entityCounts).sort()];

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6 lg:p-7'>
				<div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Activity ledger</p>
						<h2 className='mt-2 text-2xl font-semibold text-white'>Audit trail</h2>
						<p className='mt-2 max-w-3xl text-sm leading-7 text-slate-400'>
							Every sensitive moderation action is captured here so changes stay traceable and accountable.
						</p>
					</div>

					<input
						type='text'
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder='Search audit logs'
						className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55 lg:max-w-[300px]'
					/>
				</div>

				<div className='mt-5 flex flex-wrap items-center gap-2'>
					{entityFilters.map((entityType) => (
						<button
							key={entityType}
							type='button'
							onClick={() => setEntityFilter(entityType)}
							className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
								entityFilter === entityType
									? "border-sky-300/28 bg-sky-500/12 text-white"
									: "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
							}`}
						>
							{entityType === "ALL" ? "All" : `${entityType} (${entityCounts[entityType] || 0})`}
						</button>
					))}
				</div>
			</div>

			<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6'>
				<div className='flex items-center justify-between gap-3'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Timeline</p>
						<h3 className='mt-2 text-xl font-semibold text-white'>
							{filteredLogs.length} visible {filteredLogs.length === 1 ? "entry" : "entries"}
						</h3>
					</div>
				</div>

				<div className='mt-5 space-y-3'>
					{!loading && filteredLogs.length === 0 ? (
						<div className='rounded-[22px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-6 text-sm text-slate-400'>
							No audit logs match this view.
						</div>
					) : null}

					{filteredLogs.map((log) => (
						<div key={log._id} className='rounded-[22px] border border-white/8 bg-white/[0.025] p-4'>
							<div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
								<div className='min-w-0'>
									<div className='flex flex-wrap items-center gap-2'>
										<span
											className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
												entityToneByType[log.entityType] || "border-white/10 bg-white/[0.05] text-slate-200"
											}`}
										>
											{log.entityType}
										</span>
										<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300'>
											{log.action.replaceAll("_", " ")}
										</span>
									</div>
									<p className='mt-3 text-sm font-medium text-white'>{log.summary}</p>
									<div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500'>
										<span>{formatDeveloperDateTime(log.createdAt)}</span>
										{log.actor?.fullName ? <span>By {log.actor.fullName}</span> : null}
										{log.entityLabel ? <span>{log.entityLabel}</span> : null}
									</div>
								</div>
							</div>

							{log.details ? (
								<pre className='custom-scrollbar mt-4 overflow-x-auto rounded-[18px] border border-white/8 bg-slate-950/50 px-4 py-3 text-xs leading-6 text-slate-300'>
									{JSON.stringify(log.details, null, 2)}
								</pre>
							) : null}
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default DeveloperAuditLogsPage;
