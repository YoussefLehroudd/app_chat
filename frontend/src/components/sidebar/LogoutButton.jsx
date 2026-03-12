import { BiLogOut } from "react-icons/bi";
import useLogout from "../../hooks/useLogout";

const LogoutButton = () => {
	const { loading, logout } = useLogout();

	return (
		<button
			type='button'
			onClick={logout}
			disabled={loading}
			className='flex w-full items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-slate-950/55 px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-rose-400/30 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-70'
		>
			{loading ? <span className='loading loading-spinner loading-sm'></span> : <BiLogOut className='h-5 w-5' />}
			<span>{loading ? "Signing out..." : "Logout"}</span>
		</button>
	);
};

export default LogoutButton;
