import { formatDeveloperDateTime } from "./developerDashboardShared";

const DeveloperSecurityPage = ({ loading, securityData }) => {
	const kpis = securityData?.kpis || {};
	const recentEvents = securityData?.recentEvents || [];
	const suspiciousIps = securityData?.suspiciousIps || [];
	const failedLoginTargets = securityData?.failedLoginTargets || [];
	const lockedAccounts = securityData?.lockedAccounts || [];
	const activeSessions = securityData?.activeSessions || [];

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
				{[
					{ label: "Failed 24h", value: kpis.failedLogins24h ?? 0 },
					{ label: "Suspicious 7d", value: kpis.suspiciousEvents7d ?? 0 },
					{ label: "Active sessions", value: kpis.activeSessions ?? 0 },
					{ label: "Locked accounts", value: kpis.lockedAccounts ?? 0 },
				].map((card) => (
					<div key={card.label} className='rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.62))] p-4 shadow-[0_18px_44px_rgba(2,6,23,0.28)]'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>{card.label}</p>
						<p className='mt-4 text-3xl font-semibold text-white'>{card.value}</p>
					</div>
				))}
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
				<div className='space-y-4'>
					<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>IP watch</p>
						<div className='mt-4 space-y-3'>
							{suspiciousIps.map((entry) => (
								<div key={entry.ipAddress} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
									<div className='flex items-center justify-between gap-3'>
										<p className='text-sm font-semibold text-white'>{entry.ipAddress}</p>
										<span className='text-xs text-slate-500'>{entry.count} events</span>
									</div>
									<p className='mt-1 text-xs text-slate-500'>{entry.riskLevel}</p>
								</div>
							))}
						</div>
					</div>

					<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Locked accounts</p>
						<div className='mt-4 space-y-3'>
							{lockedAccounts.map((user) => (
								<div key={user._id} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
									<p className='text-sm font-semibold text-white'>{user.fullName}</p>
									<p className='mt-1 text-xs text-slate-500'>@{user.username}</p>
									<p className='mt-2 text-xs text-rose-100'>Locked until {formatDeveloperDateTime(user.lockedUntil)}</p>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className='space-y-4'>
					<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Failed login targets</p>
						<div className='mt-4 space-y-3'>
							{failedLoginTargets.map((entry, index) => (
								<div key={`${entry.user?._id || "unknown"}-${index}`} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
									<div className='flex items-center justify-between gap-3'>
										<p className='text-sm font-semibold text-white'>{entry.user?.fullName || "Unknown account"}</p>
										<span className='text-xs text-slate-500'>{entry.count}</span>
									</div>
									<p className='mt-1 text-xs text-slate-500'>@{entry.user?.username || "unknown"}</p>
								</div>
							))}
						</div>
					</div>

					<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Recent security timeline</p>
						<div className='mt-4 space-y-3'>
							{recentEvents.slice(0, 12).map((event) => (
								<div key={event._id} className='rounded-[18px] border border-white/8 bg-slate-950/40 p-3'>
									<div className='flex items-center justify-between gap-3'>
										<p className='text-sm font-semibold text-white'>{event.summary}</p>
										<span className='text-[10px] uppercase tracking-[0.18em] text-slate-500'>{event.riskLevel}</span>
									</div>
									<div className='mt-2 flex flex-wrap gap-3 text-xs text-slate-500'>
										<span>{formatDeveloperDateTime(event.createdAt)}</span>
										{event.user?.fullName ? <span>{event.user.fullName}</span> : null}
										{event.ipAddress ? <span>{event.ipAddress}</span> : null}
									</div>
								</div>
							))}
						</div>
					</div>

					<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Live sessions</p>
						<div className='mt-4 space-y-3'>
							{activeSessions.slice(0, 8).map((session) => (
								<div key={session._id} className='rounded-[18px] border border-white/8 bg-white/[0.025] p-3'>
									<p className='text-sm font-semibold text-white'>{session.user?.fullName || "Unknown user"}</p>
									<p className='mt-1 text-xs text-slate-500'>{session.userAgent || "Unknown device"}</p>
									<div className='mt-2 flex flex-wrap gap-3 text-xs text-slate-500'>
										<span>{session.ipAddress || "Unknown IP"}</span>
										<span>{formatDeveloperDateTime(session.lastSeenAt)}</span>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default DeveloperSecurityPage;
