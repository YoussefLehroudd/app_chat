import { formatDeveloperDateTime } from "./developerDashboardShared";

const SectionCard = ({ title, subtitle, children }) => (
	<div className='rounded-[22px] border border-white/10 bg-white/[0.03] p-4'>
		<div className='flex items-center justify-between gap-3'>
			<div>
				<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>{title}</p>
				{subtitle ? <p className='mt-1 text-xs text-slate-500'>{subtitle}</p> : null}
			</div>
		</div>
		<div className='mt-4 space-y-3'>{children}</div>
	</div>
);

const DetailRow = ({ label, value }) => (
	<div className='flex items-center justify-between gap-3 text-sm'>
		<span className='text-slate-500'>{label}</span>
		<span className='text-right font-medium text-slate-100'>{value}</span>
	</div>
);

const DeveloperUserInsightsModal = ({ open, loading, data, onClose }) => {
	if (!open) return null;

	const user = data?.user || null;

	return (
		<div className='fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/78 p-4 backdrop-blur-sm' onClick={onClose}>
			<div
				className='custom-scrollbar max-h-[92vh] w-full max-w-[1180px] overflow-y-auto rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,13,26,0.96),rgba(11,20,38,0.96))] p-5 shadow-[0_30px_90px_rgba(2,6,23,0.55)] sm:p-6'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Admin profile view</p>
						<h2 className='mt-2 text-2xl font-semibold text-white'>
							{user ? `${user.fullName} (@${user.username})` : "Loading user profile"}
						</h2>
						<p className='mt-2 text-sm text-slate-400'>
							Devices, reports, group history, security activity, and moderation trail in one place.
						</p>
					</div>

					<button
						type='button'
						onClick={onClose}
						className='inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]'
					>
						Close
					</button>
				</div>

				{loading || !data ? (
					<div className='py-16 text-center text-sm text-slate-400'>Loading user insights...</div>
				) : (
					<div className='mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'>
						<div className='space-y-4'>
							<SectionCard title='Identity' subtitle='Current account state'>
								<DetailRow label='Email' value={user?.email || "Not set"} />
								<DetailRow label='Role' value={user?.role || "USER"} />
								<DetailRow label='Verified badge' value={user?.isVerified ? "Granted" : "Not verified"} />
								<DetailRow label='Recovery email' value={user?.isEmailVerified ? "Verified" : "Not verified"} />
								<DetailRow label='2FA' value={user?.twoFactorEnabled ? "Enabled" : "Disabled"} />
								<DetailRow label='Locked until' value={user?.lockedUntil ? formatDeveloperDateTime(user.lockedUntil) : "Not locked"} />
								<DetailRow label='Failed attempts' value={String(data.counts?.failedLoginAttempts || 0)} />
							</SectionCard>

							<SectionCard title='Usage' subtitle='Activity footprint'>
								<DetailRow label='Sent messages' value={String(data.counts?.sentMessages || 0)} />
								<DetailRow label='Groups joined' value={String(data.counts?.groupMemberships || 0)} />
								<DetailRow label='Reports created' value={String(data.counts?.reportsCreated || 0)} />
								<DetailRow label='Reports against' value={String(data.counts?.reportsAgainst || 0)} />
								<DetailRow label='Known devices' value={String(data.counts?.sessionCount || 0)} />
							</SectionCard>

							<SectionCard title='Devices' subtitle='Recent sessions and IPs'>
								{(data.sessions || []).length === 0 ? (
									<p className='text-sm text-slate-500'>No device sessions recorded.</p>
								) : (
									data.sessions.map((session) => (
										<div key={session.id} className='rounded-[18px] border border-white/8 bg-slate-950/40 p-3'>
											<p className='text-sm font-medium text-white'>{session.userAgent || "Unknown device"}</p>
											<p className='mt-1 text-xs text-slate-500'>{session.ipAddress || "Unknown IP"}</p>
											<div className='mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500'>
												<span>Seen {formatDeveloperDateTime(session.lastSeenAt)}</span>
												{session.revokedAt ? <span>Revoked {formatDeveloperDateTime(session.revokedAt)}</span> : <span>Active</span>}
											</div>
										</div>
									))
								)}
							</SectionCard>
						</div>

						<div className='space-y-4'>
							<SectionCard title='Groups' subtitle='Recent memberships'>
								{(data.groups || []).length === 0 ? (
									<p className='text-sm text-slate-500'>No group memberships found.</p>
								) : (
									data.groups.map((group) => (
										<div key={group._id} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
											<div className='flex items-center justify-between gap-3'>
												<p className='text-sm font-semibold text-white'>{group.title}</p>
												<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
													{group.memberRole}
												</span>
											</div>
											<div className='mt-2 flex flex-wrap gap-3 text-xs text-slate-500'>
												<span>{group.memberCount} members</span>
												<span>{group.messageCount} messages</span>
												<span>{group.isPrivate ? "Private" : "Public"}</span>
											</div>
										</div>
									))
								)}
							</SectionCard>

							<SectionCard title='Reports' subtitle='Created and targeted'>
								<div className='grid gap-3 lg:grid-cols-2'>
									<div className='space-y-3'>
										<p className='text-xs font-semibold uppercase tracking-[0.2em] text-slate-500'>Created by user</p>
										{(data.reportsCreated || []).map((report) => (
											<div key={report.id || report._id} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
												<p className='text-sm font-medium text-white'>{report.reason}</p>
												<p className='mt-1 text-xs text-slate-500'>{report.targetLabel}</p>
											</div>
										))}
									</div>
									<div className='space-y-3'>
										<p className='text-xs font-semibold uppercase tracking-[0.2em] text-slate-500'>Reports against user</p>
										{(data.reportsAgainst || []).map((report) => (
											<div key={report.id || report._id} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
												<p className='text-sm font-medium text-white'>{report.reason}</p>
												<p className='mt-1 text-xs text-slate-500'>{report.status} · {report.priority}</p>
											</div>
										))}
									</div>
								</div>
							</SectionCard>

							<SectionCard title='Security and moderation trail' subtitle='Recent events and audit entries'>
								{[...(data.securityEvents || []), ...(data.auditTrail || [])]
									.sort((entryA, entryB) => new Date(entryB.createdAt).getTime() - new Date(entryA.createdAt).getTime())
									.slice(0, 12)
									.map((entry, index) => (
										<div key={`${entry._id}-${index}`} className='rounded-[18px] border border-white/8 bg-slate-950/40 p-3'>
											<p className='text-sm font-medium text-white'>{entry.summary || entry.action}</p>
											<p className='mt-1 text-xs text-slate-500'>{formatDeveloperDateTime(entry.createdAt)}</p>
										</div>
									))}
							</SectionCard>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default DeveloperUserInsightsModal;
