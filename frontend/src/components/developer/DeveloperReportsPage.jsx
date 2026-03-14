import { useEffect, useMemo, useState } from "react";
import DeveloperSelect from "./DeveloperSelect";
import { formatDeveloperDateTime } from "./developerDashboardShared";

const reportStatusClasses = {
	OPEN: "border-rose-300/20 bg-rose-500/10 text-rose-100",
	IN_REVIEW: "border-amber-300/20 bg-amber-400/10 text-amber-100",
	RESOLVED: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
	DISMISSED: "border-slate-200/15 bg-white/[0.05] text-slate-200",
};

const reportPriorityClasses = {
	LOW: "border-white/10 bg-white/[0.05] text-slate-200",
	MEDIUM: "border-sky-300/20 bg-sky-500/10 text-sky-100",
	HIGH: "border-amber-300/20 bg-amber-400/10 text-amber-100",
	CRITICAL: "border-rose-300/20 bg-rose-500/10 text-rose-100",
};

const statusOrder = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"];
const priorityOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const targetTypeDescriptions = {
	USER: "Account reports",
	GROUP: "Group moderation cases",
	MESSAGE: "Group message incidents",
};
const ruleScopeOptions = ["MESSAGE", "REPORT", "USERNAME", "PROFILE"];

const normalizeDraftsFromReports = (reports) =>
	reports.reduce((accumulator, report) => {
		accumulator[report._id] = {
			actionTaken: report.actionTaken || "",
			resolutionNote: report.resolutionNote || "",
			priority: report.priority || "MEDIUM",
		};
		return accumulator;
	}, {});

const DeveloperReportsPage = ({
	loading,
	reports,
	users,
	groups,
	actionKey,
	onCreateReport,
	onUpdateReport,
	moderationCenter,
	onCreateRule,
	onUpdateRule,
	onDeleteRule,
	openDeleteReportPopup,
	canManageReports,
	canDeleteReports,
}) => {
	const [searchValue, setSearchValue] = useState("");
	const [statusFilter, setStatusFilter] = useState("ALL");
	const [priorityFilter, setPriorityFilter] = useState("ALL");
	const [createForm, setCreateForm] = useState({
		targetType: "USER",
		targetId: "",
		priority: "MEDIUM",
		reason: "",
		details: "",
	});
	const [ruleForm, setRuleForm] = useState({
		label: "",
		pattern: "",
		scope: "MESSAGE",
		severity: "MEDIUM",
		actionHint: "",
	});
	const [reportDrafts, setReportDrafts] = useState({});

	useEffect(() => {
		setReportDrafts((currentDrafts) => {
			const nextDrafts = { ...normalizeDraftsFromReports(reports), ...currentDrafts };
			reports.forEach((report) => {
				if (!currentDrafts[report._id]) {
					nextDrafts[report._id] = {
						actionTaken: report.actionTaken || "",
						resolutionNote: report.resolutionNote || "",
						priority: report.priority || "MEDIUM",
					};
				}
			});
			return nextDrafts;
		});
	}, [reports]);

	const availableUsers = useMemo(
		() => users.filter((user) => !user.isArchived && !user.isBanned),
		[users]
	);

	const reportTargetOptions = useMemo(() => {
		if (createForm.targetType === "USER") {
			return availableUsers.map((user) => ({
				value: user._id,
				label: `${user.fullName} (@${user.username})`,
			}));
		}

		if (createForm.targetType === "GROUP") {
			return groups.map((group) => ({
				value: group._id,
				label: `${group.title} (${group.isPrivate ? "Private" : "Public"})`,
			}));
		}

		return [];
	}, [availableUsers, createForm.targetType, groups]);

	useEffect(() => {
		if (createForm.targetType === "MESSAGE") return;
		if (reportTargetOptions.some((option) => option.value === createForm.targetId)) return;
		setCreateForm((currentForm) => ({
			...currentForm,
			targetId: reportTargetOptions[0]?.value || "",
		}));
	}, [createForm.targetId, createForm.targetType, reportTargetOptions]);

	const summaryCounts = useMemo(
		() =>
			statusOrder.reduce((accumulator, status) => {
				accumulator[status] = reports.filter((report) => report.status === status).length;
				return accumulator;
			}, {}),
		[reports]
	);

	const filteredReports = useMemo(() => {
		const normalizedQuery = searchValue.trim().toLowerCase();

		return reports.filter((report) => {
			if (statusFilter !== "ALL" && report.status !== statusFilter) {
				return false;
			}
			if (priorityFilter !== "ALL" && report.priority !== priorityFilter) {
				return false;
			}

			if (!normalizedQuery) return true;

			return [
				report.reason,
				report.details,
				report.targetLabel,
				report.targetType,
				report.priority,
				report.createdBy?.fullName,
				report.reviewedBy?.fullName,
				report.actionTaken,
				report.resolutionNote,
			]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	}, [priorityFilter, reports, searchValue, statusFilter]);

	const createActionBusy = actionKey === "create-report";

	const handleCreateSubmit = async (event) => {
		event.preventDefault();
		const succeeded = await onCreateReport(createForm);
		if (!succeeded) return;

		setCreateForm((currentForm) => ({
			...currentForm,
			reason: "",
			details: "",
		}));
	};

	const handleDraftChange = (reportId, key, value) => {
		setReportDrafts((currentDrafts) => ({
			...currentDrafts,
			[reportId]: {
				...(currentDrafts[reportId] || { actionTaken: "", resolutionNote: "" }),
				[key]: value,
			},
		}));
	};

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6 lg:p-7'>
				<div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Incident queue</p>
						<h2 className='mt-2 text-2xl font-semibold text-white'>Reports and moderation cases</h2>
						<p className='mt-2 max-w-3xl text-sm leading-7 text-slate-400'>
							Log a case, track its status, and keep moderation follow-up visible for the whole developer team.
						</p>
					</div>

					<input
						type='text'
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder='Search reports'
						className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55 lg:max-w-[280px]'
					/>
				</div>

				<div className='mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
					{statusOrder.map((status) => (
						<button
							key={status}
							type='button'
							onClick={() => setStatusFilter(statusFilter === status ? "ALL" : status)}
							className={`rounded-[20px] border px-4 py-4 text-left transition ${
								statusFilter === status
									? "border-sky-300/28 bg-sky-500/12"
									: "border-white/8 bg-white/[0.025] hover:bg-white/[0.04]"
							}`}
						>
							<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>{status.replace("_", " ")}</p>
							<p className='mt-3 text-2xl font-semibold text-white'>{summaryCounts[status] || 0}</p>
						</button>
					))}
				</div>

				<div className='mt-4 flex flex-wrap gap-2'>
					{["ALL", ...priorityOrder].map((priority) => (
						<button
							key={priority}
							type='button'
							onClick={() => setPriorityFilter(priority)}
							className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
								priorityFilter === priority
									? "border-sky-300/28 bg-sky-500/12 text-white"
									: "border-white/10 bg-white/[0.04] text-slate-300"
							}`}
						>
							{priority === "ALL" ? "All priorities" : priority}
						</button>
					))}
				</div>

				{moderationCenter ? (
					<div className='mt-5 grid gap-3 xl:grid-cols-3'>
						<div className='rounded-[20px] border border-white/8 bg-white/[0.025] p-4'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Repeated targets</p>
							<div className='mt-3 space-y-2'>
								{(moderationCenter.abusePatterns?.repeatTargets || []).slice(0, 3).map((entry) => (
									<div key={entry.targetKey} className='flex items-center justify-between gap-3 text-sm'>
										<span className='truncate text-slate-300'>{entry.targetLabel}</span>
										<span className='font-semibold text-white'>{entry.count}</span>
									</div>
								))}
							</div>
						</div>
						<div className='rounded-[20px] border border-white/8 bg-white/[0.025] p-4'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Top reasons</p>
							<div className='mt-3 space-y-2'>
								{(moderationCenter.abusePatterns?.topReasons || []).slice(0, 3).map((entry) => (
									<div key={entry.reason} className='flex items-center justify-between gap-3 text-sm'>
										<span className='truncate text-slate-300'>{entry.reason}</span>
										<span className='font-semibold text-white'>{entry.count}</span>
									</div>
								))}
							</div>
						</div>
						<div className='rounded-[20px] border border-white/8 bg-white/[0.025] p-4'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Keyword hits</p>
							<div className='mt-3 space-y-2'>
								{(moderationCenter.abusePatterns?.keywordHits || []).slice(0, 3).map((entry) => (
									<div key={entry.label} className='flex items-center justify-between gap-3 text-sm'>
										<span className='truncate text-slate-300'>{entry.label}</span>
										<span className='font-semibold text-white'>{entry.count}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				) : null}
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
				<form
					onSubmit={handleCreateSubmit}
					className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6'
				>
					<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Create report</p>
					<h3 className='mt-2 text-xl font-semibold text-white'>Log a new moderation case</h3>

					<div className='mt-5 grid gap-4'>
						<div>
							<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Target type</label>
							<DeveloperSelect
								value={createForm.targetType}
								onChange={(nextValue) =>
									setCreateForm({
										targetType: nextValue,
										targetId: "",
										priority: createForm.priority,
										reason: createForm.reason,
										details: createForm.details,
									})
								}
								options={[
									{ value: "USER", label: "User", description: "Open a case on an account." },
									{ value: "GROUP", label: "Group", description: "Review a group moderation issue." },
									{ value: "MESSAGE", label: "Group message", description: "Investigate a specific message id." },
								]}
								className='mt-2'
								ariaLabel='Report target type'
								disabled={!canManageReports}
							/>
							<p className='mt-2 text-xs text-slate-500'>{targetTypeDescriptions[createForm.targetType]}</p>
						</div>

						<div>
							<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>
								{createForm.targetType === "MESSAGE" ? "Message id" : "Target"}
							</label>
							{createForm.targetType === "MESSAGE" ? (
								<input
									type='text'
									value={createForm.targetId}
									onChange={(event) => setCreateForm((currentForm) => ({ ...currentForm, targetId: event.target.value }))}
									placeholder='Paste a group message id'
									className='mt-2 h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
									disabled={!canManageReports}
								/>
							) : (
								<DeveloperSelect
									value={createForm.targetId}
									onChange={(nextValue) => setCreateForm((currentForm) => ({ ...currentForm, targetId: nextValue }))}
									options={
										reportTargetOptions.length === 0
											? [{ value: "", label: "No targets available", description: "Nothing matches the selected target type.", disabled: true }]
											: reportTargetOptions
									}
									className='mt-2'
									ariaLabel='Report target'
									disabled={!canManageReports || reportTargetOptions.length === 0}
								/>
							)}
						</div>

						<div>
							<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Priority</label>
							<DeveloperSelect
								value={createForm.priority}
								onChange={(nextValue) => setCreateForm((currentForm) => ({ ...currentForm, priority: nextValue }))}
								options={priorityOrder}
								className='mt-2'
								ariaLabel='Report priority'
								disabled={!canManageReports}
							/>
						</div>

						<div>
							<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Reason</label>
							<input
								type='text'
								value={createForm.reason}
								onChange={(event) => setCreateForm((currentForm) => ({ ...currentForm, reason: event.target.value }))}
								placeholder='Spam, harassment, abuse, impersonation...'
								className='mt-2 h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
								disabled={!canManageReports}
							/>
						</div>

						<div>
							<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Details</label>
							<textarea
								value={createForm.details}
								onChange={(event) => setCreateForm((currentForm) => ({ ...currentForm, details: event.target.value }))}
								placeholder='Extra context for the team'
								rows={5}
								className='mt-2 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
								disabled={!canManageReports}
							/>
						</div>
					</div>

					<div className='mt-5 flex justify-end'>
						<button
							type='submit'
							disabled={!canManageReports || createActionBusy}
							className='inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_34px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto'
						>
							{createActionBusy ? "Creating..." : "Create report"}
						</button>
					</div>

					<div className='mt-6 border-t border-white/10 pt-5'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>Keyword rules</p>
						<div className='mt-4 grid gap-3'>
							<input
								type='text'
								value={ruleForm.label}
								onChange={(event) => setRuleForm((current) => ({ ...current, label: event.target.value }))}
								placeholder='Rule label'
								className='h-11 rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
								disabled={!canManageReports}
							/>
							<input
								type='text'
								value={ruleForm.pattern}
								onChange={(event) => setRuleForm((current) => ({ ...current, pattern: event.target.value }))}
								placeholder='Pattern or keyword'
								className='h-11 rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
								disabled={!canManageReports}
							/>
							<div className='grid gap-3 sm:grid-cols-2'>
								<DeveloperSelect
									value={ruleForm.scope}
									onChange={(nextValue) => setRuleForm((current) => ({ ...current, scope: nextValue }))}
									options={ruleScopeOptions}
									size='sm'
									ariaLabel='Rule scope'
									disabled={!canManageReports}
								/>
								<DeveloperSelect
									value={ruleForm.severity}
									onChange={(nextValue) => setRuleForm((current) => ({ ...current, severity: nextValue }))}
									options={priorityOrder}
									size='sm'
									ariaLabel='Rule severity'
									disabled={!canManageReports}
								/>
							</div>
							<button
								type='button'
								onClick={async () => {
									const succeeded = await onCreateRule(ruleForm);
									if (succeeded) {
										setRuleForm({
											label: "",
											pattern: "",
											scope: "MESSAGE",
											severity: "MEDIUM",
											actionHint: "",
										});
									}
								}}
								disabled={!canManageReports || actionKey === "create-rule"}
								className='inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 disabled:opacity-60'
							>
								{actionKey === "create-rule" ? "Creating..." : "Add moderation rule"}
							</button>

							<div className='space-y-2'>
								{(moderationCenter?.rules || []).slice(0, 6).map((rule) => (
									<div key={rule._id} className='rounded-[16px] border border-white/8 bg-white/[0.025] px-3 py-2.5'>
										<div className='flex flex-wrap items-center justify-between gap-2'>
											<div>
												<p className='text-sm font-semibold text-white'>{rule.label}</p>
												<p className='mt-1 text-xs text-slate-500'>
													{rule.scope} · {rule.severity}
												</p>
											</div>
											<div className='flex gap-2'>
												<button
													type='button'
													onClick={() => onUpdateRule(rule, { isActive: !rule.isActive })}
													disabled={!canManageReports || actionKey === `update-rule-${rule._id}`}
													className='rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-60'
												>
													{rule.isActive ? "Disable" : "Enable"}
												</button>
												<button
													type='button'
													onClick={() => onDeleteRule(rule)}
													disabled={!canManageReports || actionKey === `delete-rule-${rule._id}`}
													className='rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 disabled:opacity-60'
												>
													Delete
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</form>

				<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6'>
					<div className='flex items-center justify-between gap-3'>
						<div>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Review queue</p>
							<h3 className='mt-2 text-xl font-semibold text-white'>
								{filteredReports.length} visible {filteredReports.length === 1 ? "report" : "reports"}
							</h3>
						</div>
						{statusFilter !== "ALL" ? (
							<button
								type='button'
								onClick={() => setStatusFilter("ALL")}
								className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200'
							>
								Clear filter
							</button>
						) : null}
					</div>

					<div className='mt-5 space-y-3'>
						{!loading && filteredReports.length === 0 ? (
							<div className='rounded-[22px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-6 text-sm text-slate-400'>
								No reports match this view.
							</div>
						) : null}

						{filteredReports.map((report) => {
							const draft = reportDrafts[report._id] || { actionTaken: "", resolutionNote: "" };
							const statusActionKey = `report-status-${report._id}`;
							const deleteActionKey = `delete-report-${report._id}`;
							const isBusy = actionKey === statusActionKey || actionKey === deleteActionKey;

							return (
								<div key={report._id} className='rounded-[22px] border border-white/8 bg-white/[0.025] p-4'>
									<div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
										<div className='min-w-0'>
											<div className='flex flex-wrap items-center gap-2'>
												<p className='text-base font-semibold text-white'>{report.targetLabel}</p>
												<span
													className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
														reportStatusClasses[report.status] || "border-white/10 bg-white/[0.05] text-slate-200"
													}`}
												>
													{report.status.replace("_", " ")}
												</span>
												<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300'>
													{report.targetType}
												</span>
												<span
													className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
														reportPriorityClasses[report.priority] || "border-white/10 bg-white/[0.04] text-slate-300"
													}`}
												>
													{report.priority}
												</span>
											</div>
											<p className='mt-2 text-sm font-medium text-slate-200'>{report.reason}</p>
											{report.details ? <p className='mt-2 text-sm leading-7 text-slate-400'>{report.details}</p> : null}
											<div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500'>
												<span>Created {formatDeveloperDateTime(report.createdAt)}</span>
												{report.createdBy?.fullName ? <span>By {report.createdBy.fullName}</span> : null}
												{report.reviewedBy?.fullName ? <span>Reviewed by {report.reviewedBy.fullName}</span> : null}
												{report.assignedTo?.fullName ? <span>Assigned to {report.assignedTo.fullName}</span> : null}
											</div>
										</div>
									</div>

									{report.moderationInsights ? (
										<div className='mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,0.28fr)]'>
											<div className='rounded-[18px] border border-white/8 bg-slate-950/40 p-3'>
												<p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500'>Signals</p>
												<div className='mt-3 flex flex-wrap gap-2'>
													<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
														Risk {report.moderationInsights.riskLevel}
													</span>
													<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
														Related {report.moderationInsights.relatedReportCount}
													</span>
												</div>
												<div className='mt-3 flex flex-wrap gap-2'>
													{(report.moderationInsights.matchedRules || []).map((rule) => (
														<span
															key={rule.id}
															className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
																reportPriorityClasses[rule.severity] || "border-white/10 bg-white/[0.04] text-slate-300"
															}`}
														>
															{rule.label}
														</span>
													))}
												</div>
											</div>
											<div className='rounded-[18px] border border-white/8 bg-slate-950/40 p-3'>
												<p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500'>Timeline</p>
												<div className='mt-3 space-y-2'>
													{(report.timeline || []).slice(-3).map((event) => (
														<div key={event._id} className='text-xs text-slate-400'>
															<p className='font-semibold text-slate-200'>{event.status}</p>
															<p>{formatDeveloperDateTime(event.createdAt)}</p>
														</div>
													))}
												</div>
											</div>
										</div>
									) : null}

									<div className='mt-4 grid gap-3'>
										<DeveloperSelect
											value={draft.priority}
											onChange={(nextValue) => handleDraftChange(report._id, "priority", nextValue)}
											options={priorityOrder}
											size='sm'
											ariaLabel='Draft report priority'
											disabled={!canManageReports}
										/>
										<input
											type='text'
											value={draft.actionTaken}
											onChange={(event) => handleDraftChange(report._id, "actionTaken", event.target.value)}
											placeholder='Action taken'
											className='h-11 w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
											disabled={!canManageReports}
										/>
										<textarea
											value={draft.resolutionNote}
											onChange={(event) => handleDraftChange(report._id, "resolutionNote", event.target.value)}
											placeholder='Resolution note'
											rows={3}
											className='w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
											disabled={!canManageReports}
										/>
									</div>

									<div className='mt-4 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap'>
										{statusOrder.map((status) => (
											<button
												key={status}
												type='button'
												disabled={!canManageReports || isBusy}
												onClick={() =>
													onUpdateReport(report, {
														status,
														priority: draft.priority,
														actionTaken: draft.actionTaken,
														resolutionNote: draft.resolutionNote,
													})
												}
												className={`inline-flex items-center justify-center rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
													report.status === status
														? "border-sky-300/28 bg-sky-500/12 text-white"
														: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
												}`}
											>
												{isBusy && report.status !== status ? "Saving..." : status.replace("_", " ")}
											</button>
										))}
										{canDeleteReports ? (
											<button
												type='button'
												disabled={isBusy}
												onClick={() => openDeleteReportPopup(report)}
												className='inline-flex items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
											>
												{actionKey === deleteActionKey ? "Deleting..." : "Delete report"}
											</button>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
};

export default DeveloperReportsPage;
