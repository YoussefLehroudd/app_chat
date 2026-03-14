import { useMemo, useState } from "react";
import DeveloperSelect from "./DeveloperSelect";
import { formatDeveloperDateTime } from "./developerDashboardShared";

const statusOptions = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"];
const priorityOptions = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const DeveloperSupportTicketsPage = ({
	loading,
	tickets,
	users,
	actionKey,
	onCreateTicket,
	onUpdateTicket,
	onAddTicketMessage,
	canManageReports,
}) => {
	const [searchValue, setSearchValue] = useState("");
	const [statusFilter, setStatusFilter] = useState("ALL");
	const [createForm, setCreateForm] = useState({
		subject: "",
		category: "GENERAL",
		priority: "MEDIUM",
		details: "",
		assignedToId: "",
	});
	const [messageDrafts, setMessageDrafts] = useState({});

	const developerOptions = useMemo(
		() => users.filter((user) => user.role === "DEVELOPER" && !user.isArchived && !user.isBanned),
		[users]
	);
	const developerSelectOptions = useMemo(
		() => [
			{ value: "", label: "Unassigned", description: "Leave this ticket without an owner." },
			...developerOptions.map((developer) => ({
				value: developer._id,
				label: developer.fullName,
				description: `@${developer.username}`,
			})),
		],
		[developerOptions]
	);

	const filteredTickets = useMemo(() => {
		const normalizedQuery = searchValue.trim().toLowerCase();
		return tickets.filter((ticket) => {
			if (statusFilter !== "ALL" && ticket.status !== statusFilter) return false;
			if (!normalizedQuery) return true;

			return [ticket.subject, ticket.details, ticket.category, ticket.priority, ticket.createdBy?.fullName, ticket.assignedTo?.fullName]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedQuery));
		});
	}, [tickets, searchValue, statusFilter]);

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
				<div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Support flow</p>
						<h2 className='mt-2 text-2xl font-semibold text-white'>Support tickets</h2>
						<p className='mt-2 max-w-3xl text-sm leading-7 text-slate-400'>
							Track account help requests separately from moderation reports so abuse review and support work do not mix.
						</p>
					</div>

					<input
						type='text'
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder='Search tickets'
						className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 lg:max-w-[260px]'
					/>
				</div>

				<div className='mt-5 flex flex-wrap gap-2'>
					{["ALL", ...statusOptions].map((status) => (
						<button
							key={status}
							type='button'
							onClick={() => setStatusFilter(status)}
							className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
								statusFilter === status
									? "border-sky-300/28 bg-sky-500/12 text-white"
									: "border-white/10 bg-white/[0.04] text-slate-300"
							}`}
						>
							{status === "ALL" ? "All" : status.replaceAll("_", " ")}
						</button>
					))}
				</div>
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]'>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						const succeeded = await onCreateTicket(createForm);
						if (succeeded) {
							setCreateForm({
								subject: "",
								category: "GENERAL",
								priority: "MEDIUM",
								details: "",
								assignedToId: "",
							});
						}
					}}
					className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'
				>
					<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Create ticket</p>
					<div className='mt-5 grid gap-4'>
						<input
							type='text'
							value={createForm.subject}
							onChange={(event) => setCreateForm((current) => ({ ...current, subject: event.target.value }))}
							placeholder='Subject'
							className='h-12 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canManageReports}
						/>
						<div className='grid gap-4 sm:grid-cols-2'>
							<input
								type='text'
								value={createForm.category}
								onChange={(event) => setCreateForm((current) => ({ ...current, category: event.target.value }))}
								placeholder='Category'
								className='h-12 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
								disabled={!canManageReports}
							/>
							<DeveloperSelect
								value={createForm.priority}
								onChange={(nextValue) => setCreateForm((current) => ({ ...current, priority: nextValue }))}
								options={priorityOptions}
								ariaLabel='Ticket priority'
								disabled={!canManageReports}
							/>
						</div>
						<DeveloperSelect
							value={createForm.assignedToId}
							onChange={(nextValue) => setCreateForm((current) => ({ ...current, assignedToId: nextValue }))}
							options={developerSelectOptions}
							ariaLabel='Assign ticket'
							disabled={!canManageReports}
						/>
						<textarea
							value={createForm.details}
							onChange={(event) => setCreateForm((current) => ({ ...current, details: event.target.value }))}
							rows={6}
							placeholder='Ticket details'
							className='rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canManageReports}
						/>
						<button
							type='submit'
							disabled={!canManageReports || actionKey === "create-ticket"}
							className='inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60'
						>
							{actionKey === "create-ticket" ? "Creating..." : "Create ticket"}
						</button>
					</div>
				</form>

				<div className='space-y-3'>
					{!loading && filteredTickets.length === 0 ? (
						<div className='rounded-[24px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-8 text-sm text-slate-400'>
							No tickets match this view.
						</div>
					) : null}

					{filteredTickets.map((ticket) => (
						<div key={ticket._id} className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_20px_56px_rgba(2,6,23,0.28)]'>
							<div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
								<div className='min-w-0'>
									<div className='flex flex-wrap items-center gap-2'>
										<p className='text-lg font-semibold text-white'>{ticket.subject}</p>
										<span className='rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
											{ticket.status.replaceAll("_", " ")}
										</span>
										<span className='rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
											{ticket.priority}
										</span>
									</div>
									<p className='mt-2 text-sm leading-7 text-slate-400'>{ticket.details}</p>
									<div className='mt-3 flex flex-wrap gap-3 text-xs text-slate-500'>
										<span>Created {formatDeveloperDateTime(ticket.createdAt)}</span>
										<span>{ticket.category}</span>
										<span>{ticket.assignedTo?.fullName || "Unassigned"}</span>
									</div>
								</div>

								<div className='grid gap-2 sm:grid-cols-3'>
									<DeveloperSelect
										value={ticket.status}
										onChange={(nextValue) =>
											onUpdateTicket(ticket, { status: nextValue, priority: ticket.priority, assignedToId: ticket.assignedTo?._id || "" })
										}
										options={statusOptions}
										ariaLabel='Ticket status'
										size='sm'
										disabled={!canManageReports || actionKey === `ticket-update-${ticket._id}`}
									/>
									<DeveloperSelect
										value={ticket.priority}
										onChange={(nextValue) =>
											onUpdateTicket(ticket, { status: ticket.status, priority: nextValue, assignedToId: ticket.assignedTo?._id || "" })
										}
										options={priorityOptions}
										ariaLabel='Ticket priority'
										size='sm'
										disabled={!canManageReports || actionKey === `ticket-update-${ticket._id}`}
									/>
									<DeveloperSelect
										value={ticket.assignedTo?._id || ""}
										onChange={(nextValue) =>
											onUpdateTicket(ticket, { status: ticket.status, priority: ticket.priority, assignedToId: nextValue })
										}
										options={developerSelectOptions}
										ariaLabel='Assigned developer'
										size='sm'
										disabled={!canManageReports || actionKey === `ticket-update-${ticket._id}`}
									/>
								</div>
							</div>

							<div className='mt-4 space-y-2'>
								{(ticket.messages || []).slice(-3).map((message) => (
									<div key={message._id} className='rounded-[18px] border border-white/8 bg-slate-950/40 px-3 py-2.5'>
										<div className='flex items-center justify-between gap-3'>
											<p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
												{message.author?.fullName || "Unknown"} {message.isInternal ? "· internal" : ""}
											</p>
											<p className='text-[11px] text-slate-500'>{formatDeveloperDateTime(message.createdAt)}</p>
										</div>
										<p className='mt-2 text-sm text-slate-200'>{message.message}</p>
									</div>
								))}
							</div>

							<div className='mt-4 flex gap-2'>
								<input
									type='text'
									value={messageDrafts[ticket._id] || ""}
									onChange={(event) => setMessageDrafts((current) => ({ ...current, [ticket._id]: event.target.value }))}
									placeholder='Add internal note'
									className='h-11 flex-1 rounded-[16px] border border-white/10 bg-slate-950/40 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
									disabled={!canManageReports}
								/>
								<button
									type='button'
									onClick={async () => {
										const note = messageDrafts[ticket._id] || "";
										const succeeded = await onAddTicketMessage(ticket, note);
										if (succeeded) {
											setMessageDrafts((current) => ({ ...current, [ticket._id]: "" }));
										}
									}}
									disabled={!canManageReports || !messageDrafts[ticket._id] || actionKey === `ticket-message-${ticket._id}`}
									className='rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50'
								>
									Add note
								</button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default DeveloperSupportTicketsPage;
