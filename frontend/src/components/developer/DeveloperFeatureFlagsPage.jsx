import { useState } from "react";
import { formatDeveloperDateTime } from "./developerDashboardShared";

const DeveloperFeatureFlagsPage = ({ flags, actionKey, onCreateFlag, onUpdateFlag, canManageFeatureFlags }) => {
	const [form, setForm] = useState({
		key: "",
		name: "",
		description: "",
		rolloutPercent: 0,
		targetRoles: ["USER"],
	});

	return (
		<div className='w-full min-w-0 space-y-4'>
			<div className='grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]'>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						const succeeded = await onCreateFlag(form);
						if (succeeded) {
							setForm({
								key: "",
								name: "",
								description: "",
								rolloutPercent: 0,
								targetRoles: ["USER"],
							});
						}
					}}
					className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] sm:rounded-[30px] sm:p-6'
				>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>Release control</p>
					<h2 className='mt-2 text-2xl font-semibold text-white'>Feature flags</h2>
					<div className='mt-5 grid gap-4'>
						<input
							type='text'
							value={form.key}
							onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
							placeholder='flag-key'
							className='h-12 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canManageFeatureFlags}
						/>
						<input
							type='text'
							value={form.name}
							onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
							placeholder='Feature name'
							className='h-12 rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canManageFeatureFlags}
						/>
						<textarea
							value={form.description}
							onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
							rows={5}
							placeholder='What this flag controls'
							className='rounded-[18px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500'
							disabled={!canManageFeatureFlags}
						/>
						<label className='text-sm text-slate-300'>
							Rollout percent
							<input
								type='range'
								min='0'
								max='100'
								value={form.rolloutPercent}
								onChange={(event) => setForm((current) => ({ ...current, rolloutPercent: Number(event.target.value) }))}
								className='mt-3 w-full'
								disabled={!canManageFeatureFlags}
							/>
							<span className='mt-2 block text-xs text-slate-500'>{form.rolloutPercent}%</span>
						</label>
						<button
							type='submit'
							disabled={!canManageFeatureFlags || actionKey === "create-flag"}
							className='inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60'
						>
							{actionKey === "create-flag" ? "Creating..." : "Create feature flag"}
						</button>
					</div>
				</form>

				<div className='space-y-3'>
					{flags.map((flag) => (
						<div key={flag._id} className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_20px_56px_rgba(2,6,23,0.28)]'>
							<div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
								<div>
									<div className='flex flex-wrap items-center gap-2'>
										<p className='text-lg font-semibold text-white'>{flag.name}</p>
										<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
											{flag.key}
										</span>
										{flag.isEnabled ? (
											<span className='rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100'>
												Enabled
											</span>
										) : null}
									</div>
									<p className='mt-2 text-sm leading-7 text-slate-400'>{flag.description}</p>
									<p className='mt-3 text-xs text-slate-500'>Updated {formatDeveloperDateTime(flag.updatedAt)}</p>
								</div>

								<div className='flex flex-wrap gap-2'>
									<button
										type='button'
										onClick={() => onUpdateFlag(flag, { isEnabled: !flag.isEnabled })}
										disabled={!canManageFeatureFlags || actionKey === `update-flag-${flag._id}`}
										className='rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60'
									>
										{flag.isEnabled ? "Disable" : "Enable"}
									</button>
								</div>
							</div>

							<div className='mt-4 rounded-[18px] border border-white/8 bg-slate-950/40 px-4 py-3'>
								<div className='flex items-center justify-between gap-3'>
									<p className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>Rollout</p>
									<p className='text-sm font-semibold text-white'>{flag.rolloutPercent}%</p>
								</div>
								<input
									type='range'
									min='0'
									max='100'
									value={flag.rolloutPercent}
									onChange={(event) => onUpdateFlag(flag, { rolloutPercent: Number(event.target.value) })}
									className='mt-3 w-full'
									disabled={!canManageFeatureFlags || actionKey === `update-flag-${flag._id}`}
								/>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default DeveloperFeatureFlagsPage;
