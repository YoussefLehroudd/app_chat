import { useMemo } from "react";
import VerifiedBadge from "../common/VerifiedBadge";
import { formatDeveloperDateTime, statCards } from "./developerDashboardShared";

const toneByKey = {
	totalUsers: "from-sky-500/30 to-cyan-400/10 text-sky-100",
	developerCount: "from-indigo-500/30 to-blue-400/10 text-indigo-100",
	archivedCount: "from-amber-500/30 to-orange-400/10 text-amber-100",
	bannedCount: "from-rose-500/30 to-red-400/10 text-rose-100",
	conversationCount: "from-emerald-500/30 to-teal-400/10 text-emerald-100",
	messageCount: "from-fuchsia-500/30 to-pink-400/10 text-fuchsia-100",
};

const ringPalette = ["#38bdf8", "#22c55e", "#f59e0b", "#f43f5e", "#a78bfa", "#14b8a6"];

const clampPercent = (value) => {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
};

const DonutChart = ({ title, subtitle, segments, centerLabel, centerValue }) => {
	const normalizedSegments = (() => {
		const sanitizedSegments = segments.map((segment) => ({
			...segment,
			safePercent: clampPercent(segment.percent),
		}));
		const totalPercent = sanitizedSegments.reduce((sum, segment) => sum + segment.safePercent, 0);

		if (totalPercent <= 0) {
			return sanitizedSegments.map(({ safePercent, ...segment }) => ({
				...segment,
				normalizedPercent: 0,
			}));
		}

		return sanitizedSegments.map(({ safePercent, ...segment }) => ({
			...segment,
			normalizedPercent: (safePercent / totalPercent) * 100,
		}));
	})();
	const visibleSegments = normalizedSegments.filter((segment) => segment.normalizedPercent > 0.001);
	let gradientCursor = 0;
	const gradientStops = visibleSegments.map((segment, index) => {
		const start = gradientCursor;
		const end = Math.min(100, start + segment.normalizedPercent);
		gradientCursor = end;
		return `${segment.color || ringPalette[index % ringPalette.length]} ${start}% ${end}%`;
	});
	const ringBackground = visibleSegments.length
		? `conic-gradient(from -90deg, ${[
				...gradientStops,
				gradientCursor < 100 ? `rgba(148,163,184,0.14) ${gradientCursor}% 100%` : null,
			]
				.filter(Boolean)
				.join(", ")})`
		: "conic-gradient(from -90deg, rgba(148,163,184,0.14) 0% 100%)";

	return (
		<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.78),rgba(13,24,42,0.56))] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.28)] sm:rounded-[30px] sm:p-5'>
			<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>{title}</p>
			<p className='mt-2 text-sm text-slate-400'>{subtitle}</p>

			<div className='mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center'>
				<div className='relative h-[112px] w-[112px] shrink-0 sm:h-[132px] sm:w-[132px]'>
					<div
						className='absolute inset-0 rounded-full'
						style={{ background: ringBackground }}
					></div>
					<div className='absolute inset-[14px] rounded-full border border-white/5 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[inset_0_1px_10px_rgba(148,163,184,0.05)] sm:inset-[16px]'></div>

					<div className='absolute inset-0 flex flex-col items-center justify-center text-center'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500'>{centerLabel}</p>
						<p className='mt-1 text-2xl font-semibold text-white'>{centerValue}</p>
					</div>
				</div>

				<div className='w-full min-w-0 flex-1 space-y-3'>
					{normalizedSegments.map((segment, index) => (
						<div key={segment.label} className='flex items-center justify-between gap-3 text-sm'>
							<div className='flex min-w-0 items-center gap-2'>
								<span
									className='h-2.5 w-2.5 rounded-full'
									style={{ backgroundColor: segment.color || ringPalette[index % ringPalette.length] }}
								></span>
								<span className='truncate text-slate-300'>{segment.label}</span>
							</div>
							<div className='text-right'>
								<p className='font-semibold text-white'>{segment.value}</p>
								<p className='text-xs text-slate-500'>{Math.round(segment.normalizedPercent)}%</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

const DeveloperAnalyticsPage = ({ loading, overview, users, groups, analyticsData }) => {
	const analytics = useMemo(() => {
		const activeUsers = users.filter((user) => !user.isArchived && !user.isBanned).length;
		const verifiedUsers = users.filter((user) => user.isVerified).length;
		const developerUsers = users.filter((user) => user.role === "DEVELOPER").length;
		const publicGroups = groups.filter((group) => !group.isPrivate).length;
		const privateGroups = groups.filter((group) => group.isPrivate).length;
		const totalUsers = users.length || overview.totals.totalUsers || 1;
		const totalGroups = groups.length || 1;
		const totalAccountsForHealth = Math.max(1, activeUsers + overview.totals.archivedCount + overview.totals.bannedCount);
		const averageGroupSize =
			groups.length > 0
				? (groups.reduce((sum, group) => sum + (group.memberCount || 0), 0) / groups.length).toFixed(1)
				: "0.0";

		return {
			activeUsers,
			verifiedUsers,
			developerUsers,
			publicGroups,
			privateGroups,
			totalUsers,
			totalGroups,
			totalAccountsForHealth,
			averageGroupSize,
			topSenders: [...users]
				.sort((userA, userB) => (userB.sentMessageCount || 0) - (userA.sentMessageCount || 0))
				.slice(0, 4),
			busiestGroups: [...groups]
				.sort((groupA, groupB) => (groupB.messageCount || 0) - (groupA.messageCount || 0))
				.slice(0, 4),
		};
	}, [groups, overview.totals.archivedCount, overview.totals.bannedCount, overview.totals.totalUsers, users]);

	const statusBars = [
		{
			label: "Active accounts",
			value: analytics.activeUsers,
			description: "Users currently available in the app",
			color: "from-sky-500 to-cyan-400",
		},
		{
			label: "Verified users",
			value: analytics.verifiedUsers,
			description: "Profiles carrying a trusted badge",
			color: "from-indigo-500 to-blue-400",
		},
		{
			label: "Developers",
			value: analytics.developerUsers,
			description: "Accounts with elevated platform control",
			color: "from-violet-500 to-fuchsia-400",
		},
		{
			label: "Public groups",
			value: analytics.publicGroups,
			description: "Groups visible to everyone",
			color: "from-emerald-500 to-teal-400",
		},
		{
			label: "Private groups",
			value: analytics.privateGroups,
			description: "Invite-only group spaces",
			color: "from-rose-500 to-orange-400",
		},
	];

	const maxBarValue = Math.max(...statusBars.map((bar) => bar.value), 1);
	const analyticsKpis = analyticsData?.kpis || {};
	const trendSeries = analyticsData?.series?.messages || [];
	const trendMax = Math.max(...trendSeries.map((point) => point.count || 0), 1);
	const platformKpis = [
		{ label: "DAU", value: analyticsKpis.dau ?? 0, accent: "text-cyan-100" },
		{ label: "WAU", value: analyticsKpis.wau ?? 0, accent: "text-sky-100" },
		{ label: "Msgs today", value: analyticsKpis.messagesToday ?? 0, accent: "text-amber-100" },
		{ label: "7d retention", value: `${analyticsKpis.retention7d ?? 0}%`, accent: "text-emerald-100" },
		{ label: "30d retention", value: `${analyticsKpis.retention30d ?? 0}%`, accent: "text-violet-100" },
		{ label: "Locked", value: analyticsKpis.lockedAccounts ?? 0, accent: "text-rose-100" },
	];

	return (
		<div className='w-full min-w-0 space-y-3 sm:space-y-4'>
			<div className='grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]'>
				<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.3)] sm:rounded-[30px] sm:p-6'>
					<div className='flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
						<div>
							<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Growth engine</p>
							<h3 className='mt-2 text-xl font-semibold text-white sm:text-2xl'>Real usage and retention</h3>
							<p className='mt-2 max-w-2xl text-sm leading-7 text-slate-400'>
								Track active users, message volume, and whether new accounts return after the first week.
							</p>
						</div>
						<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500'>Avg / day</p>
							<p className='mt-2 text-2xl font-semibold text-white'>{analyticsKpis.averageMessagesPerDay ?? 0}</p>
						</div>
					</div>

					<div className='mt-6 flex items-end gap-2 overflow-x-auto pb-1'>
						{trendSeries.map((point) => (
							<div key={point.date} className='flex min-w-[40px] flex-1 flex-col items-center gap-2'>
								<div className='flex h-36 w-full items-end rounded-[16px] bg-slate-950/55 px-1.5 py-1.5'>
									<div
										className='w-full rounded-[12px] bg-gradient-to-t from-sky-500 via-cyan-400 to-cyan-200'
										style={{ height: `${Math.max(10, ((point.count || 0) / trendMax) * 100)}%` }}
									></div>
								</div>
								<p className='text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500'>{point.label}</p>
								<p className='text-xs font-semibold text-white'>{point.count}</p>
							</div>
						))}
					</div>
				</div>

				<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
					{platformKpis.map((item) => (
						<div
							key={item.label}
							className='rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(5,11,24,0.92),rgba(13,22,43,0.7))] p-4 shadow-[0_18px_44px_rgba(2,6,23,0.28)]'
						>
							<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>{item.label}</p>
							<p className={`mt-4 text-3xl font-semibold ${item.accent}`}>{item.value}</p>
						</div>
					))}
				</div>
			</div>

			<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-6'>
				{statCards.map(({ id, label, icon: Icon }) => (
					<div
						key={id}
						className={`rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.62))] p-4 shadow-[0_22px_52px_rgba(2,6,23,0.26)] sm:rounded-[28px] sm:p-5 ${
							toneByKey[id] || "text-white"
						}`}
					>
						<div className='flex items-center justify-between gap-3'>
							<p className='truncate text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400'>
								{label}
							</p>
							<div className='inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]'>
								<Icon className='h-5 w-5' />
							</div>
						</div>
						<p className='mt-5 text-2xl font-semibold text-white sm:mt-6 sm:text-3xl'>{loading ? "..." : overview.totals[id]}</p>
					</div>
				))}
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'>
				<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(5,11,24,0.94),rgba(13,22,43,0.72))] p-4 shadow-[0_28px_80px_rgba(2,6,23,0.34)] sm:rounded-[32px] sm:p-6'>
					<div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
						<div>
							<p className='text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500'>
								Platform analysis
							</p>
							<h2 className='mt-2 text-2xl font-semibold text-white sm:text-3xl'>Live balance across the app</h2>
							<p className='mt-3 max-w-2xl text-sm leading-7 text-slate-400'>
								A quick visual read of account health, trust coverage, and how public versus private
								spaces are distributed right now.
							</p>
						</div>

						<div className='grid w-full grid-cols-2 gap-3 md:min-w-[300px] md:w-auto'>
							<div className='rounded-[20px] border border-white/10 bg-white/[0.04] px-3 py-3.5 sm:rounded-[24px] sm:px-4 sm:py-4'>
								<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>Avg group size</p>
								<p className='mt-2 text-2xl font-semibold text-white'>{analytics.averageGroupSize}</p>
							</div>
							<div className='rounded-[20px] border border-white/10 bg-white/[0.04] px-3 py-3.5 sm:rounded-[24px] sm:px-4 sm:py-4'>
								<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>New this week</p>
								<p className='mt-2 text-2xl font-semibold text-white'>{overview.totals.newUsersThisWeek}</p>
							</div>
						</div>
					</div>

					<div className='mt-8 space-y-4'>
						{statusBars.map((bar) => (
							<div key={bar.label} className='rounded-[20px] border border-white/8 bg-white/[0.025] px-3.5 py-3.5 sm:rounded-[24px] sm:px-4 sm:py-4'>
								<div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
									<div>
										<p className='text-sm font-semibold text-white'>{bar.label}</p>
										<p className='mt-1 text-xs text-slate-500'>{bar.description}</p>
									</div>
									<p className='text-lg font-semibold text-white'>{bar.value}</p>
								</div>
								<div className='mt-4 h-3 overflow-hidden rounded-full bg-slate-900/85'>
									<div
										className={`h-full rounded-full bg-gradient-to-r ${bar.color}`}
										style={{ width: `${Math.max(8, (bar.value / maxBarValue) * 100)}%` }}
									></div>
								</div>
							</div>
						))}
					</div>
				</div>

				<div className='grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1'>
					<DonutChart
						title='Account health'
						subtitle='Availability of user accounts across the platform.'
						centerLabel='Available'
						centerValue={analytics.activeUsers}
						segments={[
							{
								label: "Active",
								value: analytics.activeUsers,
								percent: (analytics.activeUsers / analytics.totalAccountsForHealth) * 100,
								color: "#38bdf8",
							},
							{
								label: "Archived",
								value: overview.totals.archivedCount,
								percent: (overview.totals.archivedCount / analytics.totalAccountsForHealth) * 100,
								color: "#f59e0b",
							},
							{
								label: "Banned",
								value: overview.totals.bannedCount,
								percent: (overview.totals.bannedCount / analytics.totalAccountsForHealth) * 100,
								color: "#f43f5e",
							},
						]}
					/>

					<DonutChart
						title='Role distribution'
						subtitle='How many accounts have regular versus developer access.'
						centerLabel='Developers'
						centerValue={analytics.developerUsers}
						segments={[
							{
								label: "Developers",
								value: analytics.developerUsers,
								percent: (analytics.developerUsers / analytics.totalUsers) * 100,
								color: "#818cf8",
							},
							{
								label: "Regular users",
								value: Math.max(0, analytics.totalUsers - analytics.developerUsers),
								percent: ((analytics.totalUsers - analytics.developerUsers) / analytics.totalUsers) * 100,
								color: "#22c55e",
							},
						]}
					/>

					<DonutChart
						title='Group access split'
						subtitle='Public communities compared to private invite-only rooms.'
						centerLabel='Groups'
						centerValue={groups.length}
						segments={[
							{
								label: "Public groups",
								value: analytics.publicGroups,
								percent: (analytics.publicGroups / analytics.totalGroups) * 100,
								color: "#14b8a6",
							},
							{
								label: "Private groups",
								value: analytics.privateGroups,
								percent: (analytics.privateGroups / analytics.totalGroups) * 100,
								color: "#fb7185",
							},
						]}
					/>
				</div>
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
				<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.66))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.3)] sm:rounded-[30px] sm:p-6'>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Recent signups</p>
					<h3 className='mt-2 text-xl font-semibold text-white sm:text-2xl'>{overview.totals.newUsersThisWeek} new this week</h3>

					<div className='mt-5 grid gap-3'>
						{overview.latestUsers.map((user) => (
							<div
								key={user._id}
								className='rounded-[22px] border border-white/8 bg-white/[0.025] px-4 py-3'
							>
								<div className='flex items-center justify-between gap-3'>
									<div className='min-w-0'>
										<div className='flex flex-wrap items-center gap-2'>
											<p className='truncate text-sm font-semibold text-white'>{user.fullName}</p>
											<VerifiedBadge user={user} compact />
										</div>
										<p className='mt-1 truncate text-xs text-slate-400'>@{user.username}</p>
									</div>
									<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300'>
										{user.role}
									</span>
								</div>
								<p className='mt-2 text-xs text-slate-500'>{formatDeveloperDateTime(user.createdAt)}</p>
							</div>
						))}
					</div>
				</div>

				<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.66))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.3)] sm:rounded-[30px] sm:p-6'>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Activity leaders</p>
					<h3 className='mt-2 text-xl font-semibold text-white sm:text-2xl'>Who is moving the platform</h3>

					<div className='mt-5 grid gap-4 lg:grid-cols-2'>
						<div className='rounded-[24px] border border-white/8 bg-white/[0.025] p-4'>
							<p className='text-sm font-semibold text-white'>Top senders</p>
							<div className='mt-4 space-y-3'>
								{analytics.topSenders.map((user, index) => (
									<div key={user._id} className='flex items-center justify-between gap-3'>
										<div className='min-w-0'>
											<p className='truncate text-sm font-medium text-slate-100'>
												{index + 1}. {user.fullName}
											</p>
											<p className='truncate text-xs text-slate-500'>@{user.username}</p>
										</div>
										<p className='text-sm font-semibold text-white'>{user.sentMessageCount || 0}</p>
									</div>
								))}
							</div>
						</div>

						<div className='rounded-[24px] border border-white/8 bg-white/[0.025] p-4'>
							<p className='text-sm font-semibold text-white'>Busiest groups</p>
							<div className='mt-4 space-y-3'>
								{analytics.busiestGroups.map((group, index) => (
									<div key={group._id} className='flex items-center justify-between gap-3'>
										<div className='min-w-0'>
											<p className='truncate text-sm font-medium text-slate-100'>
												{index + 1}. {group.title}
											</p>
											<p className='truncate text-xs text-slate-500'>
												{group.isPrivate ? "Private group" : "Public group"}
											</p>
										</div>
										<p className='text-sm font-semibold text-white'>{group.messageCount || 0}</p>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default DeveloperAnalyticsPage;
