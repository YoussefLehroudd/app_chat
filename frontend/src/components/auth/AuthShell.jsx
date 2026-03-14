import { Link, useLocation } from "react-router-dom";
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

const AuthPanelScene = () => (
	<div className='auth-panel-scene' aria-hidden='true'>
		<div className='auth-panel-scene__mesh'></div>
		<div className='auth-panel-scene__beam'></div>
		<div className='auth-panel-scene__halo auth-panel-scene__halo--amber'></div>
		<div className='auth-panel-scene__halo auth-panel-scene__halo--cyan'></div>
		<div className='auth-panel-scene__stack'>
			<div className='auth-panel-scene__platform auth-panel-scene__platform--outer'></div>
			<div className='auth-panel-scene__platform auth-panel-scene__platform--inner'></div>
			<div className='auth-panel-scene__core'>
				<span className='auth-panel-scene__core-face auth-panel-scene__core-face--top'></span>
				<span className='auth-panel-scene__core-face auth-panel-scene__core-face--front'></span>
				<span className='auth-panel-scene__core-face auth-panel-scene__core-face--side'></span>
				<span className='auth-panel-scene__core-orb'></span>
			</div>
			<div className='auth-panel-scene__satellite auth-panel-scene__satellite--left'>
				<span className='auth-panel-scene__satellite-dot'></span>
				<span className='auth-panel-scene__satellite-bar auth-panel-scene__satellite-bar--accent'></span>
				<span className='auth-panel-scene__satellite-bar'></span>
			</div>
			<div className='auth-panel-scene__satellite auth-panel-scene__satellite--right'>
				<span className='auth-panel-scene__satellite-dot auth-panel-scene__satellite-dot--cyan'></span>
				<span className='auth-panel-scene__satellite-bar auth-panel-scene__satellite-bar--accent auth-panel-scene__satellite-bar--cyan'></span>
				<span className='auth-panel-scene__satellite-bar auth-panel-scene__satellite-bar--short'></span>
			</div>
		</div>
		<div className='auth-panel-scene__hud auth-panel-scene__hud--left'>
			<span></span>
			<span></span>
			<span></span>
		</div>
		<div className='auth-panel-scene__hud auth-panel-scene__hud--right'>
			<span></span>
			<span></span>
			<span></span>
		</div>
		<div className='auth-panel-scene__particles'>
			<span></span>
			<span></span>
			<span></span>
			<span></span>
		</div>
	</div>
);

const AuthShell = ({
	eyebrow,
	title,
	accent,
	description,
	footerPrompt,
	footerLinkLabel,
	footerTo,
	shellVariant = "default",
	shellClassName = "",
	children,
}) => {
	const location = useLocation();
	const isCompactShell = shellVariant === "compact";
	const shellClasses = ["auth-shell", isCompactShell ? "auth-shell--compact" : "", shellClassName]
		.filter(Boolean)
		.join(" ");
	const footerLinkState =
		location.pathname === "/login" || location.pathname === "/signup"
			? { authSwitchFrom: location.pathname }
			: undefined;

	return (
		<div className={shellClasses}>
			<div className='auth-shell__orb auth-shell__orb--one'></div>
			<div className='auth-shell__orb auth-shell__orb--two'></div>

			<div className='auth-shell__grid relative z-10 grid h-full lg:grid-cols-[0.98fr_1.02fr]'>
				<section className='auth-shell__desktop-panel relative hidden min-h-0 border-r border-white/10 px-8 py-8 lg:flex lg:flex-col lg:justify-between lg:gap-6 xl:px-10 xl:py-10'>
					<div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.24),rgba(2,6,23,0.62))]'></div>
					<div className='pointer-events-none absolute left-8 top-8 h-24 w-24 rounded-full border border-white/10'></div>
					<div className='pointer-events-none absolute bottom-10 right-10 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl'></div>

					<div className={`auth-shell__desktop-content ${isCompactShell ? "space-y-4" : "space-y-5"}`}>
						<div className='inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200'>
							<span className='h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.75)]'></span>
							{eyebrow}
						</div>

						<div className='auth-shell__desktop-copy max-w-xl space-y-4'>
							<p className='text-xs uppercase tracking-[0.38em] text-slate-400'>Private messaging</p>
							<h1 className='auth-shell__desktop-title text-4xl font-semibold leading-[1.02] text-white xl:text-5xl'>
								{title}{" "}
								<span className='text-amber-200/95'>
									{accent}
								</span>
							</h1>
							<p className='auth-shell__desktop-description max-w-lg text-base leading-7 text-slate-300/90'>{description}</p>
						</div>

						<div className={`auth-shell__feature-list grid ${isCompactShell ? "gap-2.5" : "gap-3"}`}>
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

					<div
						className={`auth-shell__desktop-footer flex items-center gap-4 rounded-[24px] border border-white/10 bg-black/20 px-5 py-4 backdrop-blur-md ${
							isCompactShell ? "lg:hidden" : ""
						}`}
					>
						<div className='flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5efe4] text-lg font-bold text-slate-900'>
							C
						</div>
						<div>
							<p className='text-sm uppercase tracking-[0.28em] text-slate-400'>ChatApp</p>
							<p className='mt-1 text-sm text-slate-300'>Calmer visuals, stronger contrast, cleaner auth flow.</p>
						</div>
					</div>
				</section>

				<section
					className={`auth-shell__form-section relative flex items-center p-4 sm:p-6 ${
						isCompactShell ? "lg:p-4 xl:p-5" : "lg:p-5 xl:p-6"
					}`}
				>
					<div className='auth-form-panel w-full'>
						<AuthPanelScene />
						<div className='auth-panel-body relative z-10'>{children}</div>

						<div className='auth-panel-footer relative z-10 mt-6 border-t border-slate-300/80 pt-4 text-sm text-slate-500'>
							{footerPrompt}{" "}
							<Link to={footerTo} state={footerLinkState} className='auth-inline-link'>
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
