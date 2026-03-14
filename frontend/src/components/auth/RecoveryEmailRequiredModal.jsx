import { useEffect, useState } from "react";
import { IoMailOpenOutline, IoShieldCheckmarkOutline } from "react-icons/io5";
import { useAuthContext } from "../../context/AuthContext";

const RecoveryEmailRequiredModal = () => {
	const { authUser, setAuthUser } = useAuthContext();
	const [email, setEmail] = useState(authUser?.email || "");
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		setEmail(authUser?.email || "");
	}, [authUser?.email]);

	if (!authUser || authUser.email) {
		return null;
	}

	const handleSubmit = async (event) => {
		event.preventDefault();
		setErrorMessage("");
		setLoading(true);

		try {
			const formData = new FormData();
			formData.append("email", email);

			const response = await fetch("/api/users/profile", {
				method: "PUT",
				body: formData,
			});
			const data = await response.json();

			if (!response.ok || data.error) {
				setErrorMessage(data.error || "Unable to save recovery email");
				return;
			}

			localStorage.setItem("chat-user", JSON.stringify(data));
			setAuthUser(data);
		} catch {
			setErrorMessage("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 px-4 backdrop-blur-md'>
			<div className='w-full max-w-xl rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.98),rgba(13,24,42,0.95))] p-5 shadow-[0_36px_100px_rgba(2,6,23,0.56)] sm:p-7'>
				<div className='inline-flex items-center gap-2 rounded-full border border-sky-300/18 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100'>
					<IoShieldCheckmarkOutline className='h-4 w-4' />
					Recovery required
				</div>
				<h2 className='mt-4 text-3xl font-semibold text-white'>Add your recovery email</h2>
				<p className='mt-3 text-sm leading-7 text-slate-400'>
					This account was created before recovery emails were required. Add your email now so you can reset
					your password and recover your username later.
				</p>

				<div className='mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-4'>
					<div className='flex items-start gap-3'>
						<div className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100'>
							<IoMailOpenOutline className='h-5 w-5' />
						</div>
						<div>
							<p className='text-sm font-semibold text-white'>One-time setup</p>
							<p className='mt-1 text-sm leading-6 text-slate-400'>
								You only need to do this once. This email becomes your recovery address for account help.
							</p>
						</div>
					</div>
				</div>

				<form onSubmit={handleSubmit} className='mt-5 space-y-4'>
					<div>
						<label className='mb-2 block text-sm font-medium text-slate-200'>Recovery email</label>
						<input
							type='email'
							value={email}
							onChange={(event) => {
								setEmail(event.target.value);
								setErrorMessage("");
							}}
							placeholder='you@example.com'
							autoComplete='email'
							className='h-14 w-full rounded-[20px] border border-white/10 bg-slate-950/40 px-4 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55'
						/>
					</div>

					{errorMessage ? <p className='text-sm text-rose-300'>{errorMessage}</p> : null}

					<button
						type='submit'
						disabled={loading}
						className='inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
					>
						{loading ? <span className='loading loading-spinner loading-sm'></span> : "Save recovery email"}
					</button>
				</form>
			</div>
		</div>
	);
};

export default RecoveryEmailRequiredModal;
