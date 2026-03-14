import { useState } from "react";
import DeveloperSelect from "./DeveloperSelect";
import { formatDeveloperDateTime } from "./developerDashboardShared";

const typeOptions = [
	{ value: "IN_APP", label: "In-app", description: "Live announcements inside the app." },
	{ value: "EMAIL", label: "Email", description: "Send only to verified recovery emails." },
	{ value: "BOTH", label: "Both", description: "Deliver by email and in-app together." },
];
const audienceOptions = [
	{ value: "ALL_USERS", label: "All users", description: "Everyone with an active account." },
	{ value: "ACTIVE_USERS", label: "Active users", description: "Recently active members only." },
	{ value: "VERIFIED_USERS", label: "Verified users", description: "Only accounts with verified email." },
	{ value: "UNVERIFIED_USERS", label: "Unverified users", description: "Accounts still missing verification." },
	{ value: "DEVELOPERS", label: "Developers", description: "Developer and moderator team only." },
];

const DeveloperBroadcastsPage = ({ campaigns, actionKey, onSendBroadcast, canSendBroadcasts }) => {
	const [form, setForm] = useState({
		title: "",
		subject: "",
		content: "",
		type: "IN_APP",
		audienceType: "ALL_USERS",
	});

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]'>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						const succeeded = await onSendBroadcast(form);
						if (succeeded) {
							setForm({
								title: "",
								subject: "",
								content: "",
								type: "IN_APP",
								audienceType: "ALL_USERS",
							});
						}
					}}
					className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'
				>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Broadcast desk</p>
					<h2 className='mt-2 text-2xl font-semibold text-white'>Announcements and campaigns</h2>

					<div className='mt-5 grid gap-4'>
						<input
							type='text'
							value={form.title}
							onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
							placeholder='Campaign title'
							className='h-12 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canSendBroadcasts}
						/>
						<input
							type='text'
							value={form.subject}
							onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
							placeholder='Email subject (optional)'
							className='h-12 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canSendBroadcasts}
						/>
						<div className='grid gap-4 sm:grid-cols-2'>
							<DeveloperSelect
								value={form.type}
								onChange={(nextValue) => setForm((current) => ({ ...current, type: nextValue }))}
								options={typeOptions}
								ariaLabel='Broadcast type'
								disabled={!canSendBroadcasts}
							/>
							<DeveloperSelect
								value={form.audienceType}
								onChange={(nextValue) => setForm((current) => ({ ...current, audienceType: nextValue }))}
								options={audienceOptions}
								ariaLabel='Broadcast audience'
								disabled={!canSendBroadcasts}
							/>
						</div>
						<textarea
							value={form.content}
							onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
							rows={8}
							placeholder='Announcement content'
							className='rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canSendBroadcasts}
						/>
						<button
							type='submit'
							disabled={!canSendBroadcasts || actionKey === "send-broadcast"}
							className='inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60'
						>
							{actionKey === "send-broadcast" ? "Sending..." : "Send broadcast"}
						</button>
					</div>
				</form>

				<div className='space-y-3'>
					{campaigns.map((campaign) => (
						<div key={campaign._id} className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_20px_56px_rgba(2,6,23,0.28)]'>
							<div className='flex flex-wrap items-center gap-2'>
								<p className='text-lg font-semibold text-white'>{campaign.title}</p>
								<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
									{campaign.type}
								</span>
								<span className='rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
									{campaign.audienceType.replaceAll("_", " ")}
								</span>
							</div>
							<p className='mt-3 text-sm leading-7 text-slate-300'>{campaign.content}</p>
							<div className='mt-4 grid gap-3 sm:grid-cols-4'>
								<div className='rounded-[18px] border border-white/8 bg-slate-950/40 px-3 py-3'>
									<p className='text-[10px] uppercase tracking-[0.18em] text-slate-500'>Audience</p>
									<p className='mt-2 text-xl font-semibold text-white'>{campaign.audienceCount}</p>
								</div>
								<div className='rounded-[18px] border border-white/8 bg-slate-950/40 px-3 py-3'>
									<p className='text-[10px] uppercase tracking-[0.18em] text-slate-500'>In-app</p>
									<p className='mt-2 text-xl font-semibold text-white'>{campaign.deliveryCount}</p>
								</div>
								<div className='rounded-[18px] border border-white/8 bg-slate-950/40 px-3 py-3'>
									<p className='text-[10px] uppercase tracking-[0.18em] text-slate-500'>Email</p>
									<p className='mt-2 text-xl font-semibold text-white'>{campaign.emailDeliveryCount}</p>
								</div>
								<div className='rounded-[18px] border border-white/8 bg-slate-950/40 px-3 py-3'>
									<p className='text-[10px] uppercase tracking-[0.18em] text-slate-500'>Sent</p>
									<p className='mt-2 text-sm font-semibold text-white'>{formatDeveloperDateTime(campaign.sentAt || campaign.createdAt)}</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default DeveloperBroadcastsPage;
