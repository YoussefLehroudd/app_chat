import { Link } from "react-router-dom";
import { FiMessageCircle, FiShield, FiZap } from "react-icons/fi";

const features = [
	{
		icon: FiMessageCircle,
		title: "Live conversations",
		description: "Instant messaging, clean threads, and fast switching between chats.",
	},
	{
		icon: FiShield,
		title: "Private by default",
		description: "Protected routes, secure sessions, and a tighter account flow.",
	},
	{
		icon: FiZap,
		title: "Built for speed",
		description: "Fast loads, lightweight UI, and presence updates that feel immediate.",
	},
];

const AuthShell = ({
	eyebrow,
	title,
	accent,
	description,
	footerPrompt,
	footerLinkLabel,
	footerTo,
	children,
}) => {
	return (
		<div className='auth-shell animate-authFadeUp'>
			<div className='auth-shell__orb auth-shell__orb--one'></div>
			<div className='auth-shell__orb auth-shell__orb--two'></div>

			<div className='relative z-10 grid h-full lg:min-h-[760px] lg:grid-cols-[0.98fr_1.02fr]'>
				<section className='auth-shell__desktop-panel relative hidden border-r border-white/10 px-8 py-8 lg:flex lg:flex-col lg:justify-between lg:gap-6 xl:px-10 xl:py-10'>
					<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.24),rgba(2,6,23,0.62))]'></div>
					<div className='pointer-events-none absolute left-8 top-8 h-24 w-24 rounded-full border border-white/10'></div>
					<div className='pointer-events-none absolute bottom-10 right-10 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl'></div>

					<div className='auth-shell__desktop-content space-y-5'>
						<div className='inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200'>
							<span className='h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.75)]'></span>
							{eyebrow}
						</div>

						<div className='auth-shell__desktop-copy max-w-xl space-y-4'>
							<p className='text-xs uppercase tracking-[0.38em] text-slate-400'>Private messaging</p>
							<h1 className='auth-shell__desktop-title font-["Sora"] text-4xl font-semibold leading-[1.02] text-white xl:text-5xl'>
								{title}{" "}
								<span className='text-amber-200/95'>
									{accent}
								</span>
							</h1>
							<p className='auth-shell__desktop-description max-w-lg text-base leading-7 text-slate-300/90'>{description}</p>
						</div>

						<div className='auth-shell__feature-list grid gap-3'>
							{features.map(({ icon: Icon, title: featureTitle, description: featureDescription }, index) => (
								<div
									key={featureTitle}
									className='auth-shell__feature-card rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-4 backdrop-blur-sm transition duration-300 hover:border-amber-200/20 hover:bg-white/[0.06]'
								>
									<div className='flex items-start gap-4'>
										<div className='flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-amber-100'>
											<Icon size={18} />
										</div>
										<div className='flex-1'>
											<div className='flex items-center justify-between gap-4'>
												<h2 className='text-base font-semibold text-white'>{featureTitle}</h2>
												<span className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
													0{index + 1}
												</span>
											</div>
											<p className='mt-2 text-sm leading-6 text-slate-300'>{featureDescription}</p>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className='auth-shell__desktop-footer flex items-center gap-4 rounded-[24px] border border-white/10 bg-black/20 px-5 py-4 backdrop-blur-md'>
						<div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5efe4] text-lg font-bold text-slate-900'>
							C
						</div>
						<div>
							<p className='text-sm uppercase tracking-[0.28em] text-slate-400'>ChatApp</p>
							<p className='mt-1 text-sm text-slate-300'>Calmer visuals, stronger contrast, cleaner auth flow.</p>
						</div>
					</div>
				</section>

				<section className='relative flex items-center p-4 sm:p-6 lg:p-5 xl:p-6'>
					<div className='auth-form-panel w-full'>
						<div className='auth-panel-header mb-6 space-y-3'>
							<div className='inline-flex items-center gap-2 rounded-full border border-slate-300/60 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-700 lg:hidden'>
								<span className='h-2 w-2 rounded-full bg-amber-500'></span>
								{eyebrow}
							</div>
							<div className='inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-300/60 bg-white text-lg font-bold text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)]'>
								C
							</div>
							<h2 className='auth-panel-title font-["Sora"] text-3xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-4xl'>
								{title}
								<span className='block text-slate-500'>{accent}</span>
							</h2>
							<p className='auth-panel-description max-w-md text-sm leading-6 text-slate-600'>{description}</p>
						</div>

						<div className='auth-panel-body'>{children}</div>

						<div className='auth-panel-footer mt-6 border-t border-slate-300/80 pt-4 text-sm text-slate-500'>
							{footerPrompt}{" "}
							<Link to={footerTo} className='auth-inline-link'>
								{footerLinkLabel}
							</Link>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
};

export default AuthShell;
