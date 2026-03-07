import { IoShieldCheckmarkOutline, IoSparklesOutline } from "react-icons/io5";

const DeveloperBadge = ({ user, compact = false, className = "" }) => {
	if (user?.role !== "DEVELOPER") return null;

	const isPrimaryDeveloper = Boolean(user?.isPrimaryDeveloper);
	const label = isPrimaryDeveloper ? "Lead developer" : "Developer";
	const Icon = isPrimaryDeveloper ? IoSparklesOutline : IoShieldCheckmarkOutline;

	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-[linear-gradient(135deg,rgba(251,191,36,0.22),rgba(249,115,22,0.18))] text-amber-50 shadow-[0_12px_28px_rgba(251,191,36,0.12)] backdrop-blur-md ${
				compact ? "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]" : "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
			} ${className}`}
		>
			<Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
			<span>{label}</span>
		</span>
	);
};

export default DeveloperBadge;
