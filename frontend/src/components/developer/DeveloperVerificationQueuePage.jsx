import { useState } from "react";
import DeveloperSelect from "./DeveloperSelect";
import { formatDeveloperDateTime } from "./developerDashboardShared";

const DeveloperVerificationQueuePage = ({
	loading,
	verificationData,
	actionKey,
	onCreateRequest,
	onReviewRequest,
	canManageUsers,
}) => {
	const [createForm, setCreateForm] = useState({
		userId: "",
		requestNote: "",
	});
	const [reviewDrafts, setReviewDrafts] = useState({});
	const requests = verificationData?.requests || [];
	const eligibleUsers = verificationData?.eligibleUsers || [];
	const eligibleUserOptions = [
		{ value: "", label: "Select eligible user", description: "Choose which account enters the review queue." },
		...eligibleUsers.map((user) => ({
			value: user._id,
			label: user.fullName,
			description: `@${user.username}`,
		})),
	];

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
				<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Trust workflow</p>
				<h2 className='mt-2 text-2xl font-semibold text-white'>Verification review queue</h2>
				<p className='mt-2 max-w-3xl text-sm leading-7 text-slate-400'>
					Review pending badge requests, keep notes on decisions, and fast-track eligible users who already verified their email.
				</p>
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						const succeeded = await onCreateRequest(createForm);
						if (succeeded) {
							setCreateForm({ userId: "", requestNote: "" });
						}
					}}
					className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'
				>
					<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Create review</p>
					<div className='mt-5 grid gap-4'>
						<DeveloperSelect
							value={createForm.userId}
							onChange={(nextValue) => setCreateForm((current) => ({ ...current, userId: nextValue }))}
							options={eligibleUserOptions}
							ariaLabel='Eligible user'
							disabled={!canManageUsers}
						/>
						<textarea
							value={createForm.requestNote}
							onChange={(event) => setCreateForm((current) => ({ ...current, requestNote: event.target.value }))}
							rows={6}
							placeholder='Optional context for the review'
							className='rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canManageUsers}
						/>
						<button
							type='submit'
							disabled={!canManageUsers || actionKey === "create-verification-request"}
							className='inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60'
						>
							{actionKey === "create-verification-request" ? "Creating..." : "Create request"}
						</button>
					</div>
				</form>

				<div className='space-y-3'>
					{!loading && requests.length === 0 ? (
						<div className='rounded-[24px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-8 text-sm text-slate-400'>
							No verification requests yet.
						</div>
					) : null}

					{requests.map((request) => {
						const reviewNote = reviewDrafts[request._id] ?? request.reviewNote ?? "";
						return (
							<div key={request._id} className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_20px_56px_rgba(2,6,23,0.28)]'>
								<div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
									<div>
										<div className='flex flex-wrap items-center gap-2'>
											<p className='text-lg font-semibold text-white'>
												{request.user?.fullName || "Unknown user"}
											</p>
											<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
												{request.status}
											</span>
										</div>
										<p className='mt-1 text-sm text-slate-400'>@{request.user?.username || "unknown"}</p>
										<div className='mt-3 flex flex-wrap gap-3 text-xs text-slate-500'>
											<span>Opened {formatDeveloperDateTime(request.createdAt)}</span>
											<span>Requested by {request.requestedBy?.fullName || "Unknown"}</span>
										</div>
										{request.requestNote ? <p className='mt-3 text-sm text-slate-300'>{request.requestNote}</p> : null}
									</div>

									<div className='grid gap-2 sm:grid-cols-2'>
										<button
											type='button'
											onClick={() => onReviewRequest(request, { status: "APPROVED", reviewNote })}
											disabled={!canManageUsers || actionKey === `review-verification-${request._id}`}
											className='rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-60'
										>
											Approve
										</button>
										<button
											type='button'
											onClick={() => onReviewRequest(request, { status: "REJECTED", reviewNote })}
											disabled={!canManageUsers || actionKey === `review-verification-${request._id}`}
											className='rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-60'
										>
											Reject
										</button>
									</div>
								</div>

								<textarea
									value={reviewNote}
									onChange={(event) =>
										setReviewDrafts((current) => ({
											...current,
											[request._id]: event.target.value,
										}))
									}
									rows={3}
									placeholder='Reviewer note'
									className='mt-4 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
									disabled={!canManageUsers}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export default DeveloperVerificationQueuePage;
