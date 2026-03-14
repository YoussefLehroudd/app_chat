import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import { FiArrowRight, FiCheckCircle, FiEye, FiEyeOff, FiLock } from "react-icons/fi";

const ResetPassword = () => {
	const [searchParams] = useSearchParams();
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");

	const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

	const handleSubmit = async (event) => {
		event.preventDefault();
		setErrorMessage("");
		setSuccessMessage("");

		if (!token) {
			setErrorMessage("This reset link is invalid or missing.");
			return;
		}

		setLoading(true);
		try {
			const response = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token,
					password,
					confirmPassword,
				}),
			});
			const data = await response.json();

			if (!response.ok || data.error) {
				setErrorMessage(data.error || "Unable to reset password");
				return;
			}

			setSuccessMessage(data.message || "Password updated successfully");
			setPassword("");
			setConfirmPassword("");
		} catch {
			setErrorMessage("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='flex h-full w-full max-w-6xl items-center'>
			<AuthShell
				eyebrow='Password reset'
				title='Choose a new password'
				accent='Finish recovery'
				description='Create a fresh password for your account. Stronger passwords keep your conversations secure.'
				footerPrompt='Need another recovery email?'
				footerLinkLabel='Request a new link'
				footerTo='/forgot-password'
				shellVariant='compact'
			>
				<form onSubmit={handleSubmit} className='auth-form-stack flex flex-col gap-4'>
					<div className='space-y-2'>
						<label className='auth-label'>New Password</label>
						<div className={`auth-input-wrap ${errorMessage ? "auth-input-wrap--error" : ""}`}>
							<FiLock className='auth-input-icon' />
							<input
								type={showPassword ? "text" : "password"}
								placeholder='New password'
								className='auth-input'
								value={password}
								onChange={(event) => {
									setPassword(event.target.value);
									setErrorMessage("");
								}}
								autoComplete='new-password'
							/>
							<button
								type='button'
								className='auth-input-toggle'
								onClick={() => setShowPassword((current) => !current)}
								aria-label={showPassword ? "Hide password" : "Show password"}
							>
								{showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
							</button>
						</div>
					</div>

					<div className='space-y-2'>
						<label className='auth-label'>Confirm Password</label>
						<div className={`auth-input-wrap ${errorMessage ? "auth-input-wrap--error" : ""}`}>
							<FiLock className='auth-input-icon' />
							<input
								type={showConfirmPassword ? "text" : "password"}
								placeholder='Confirm password'
								className='auth-input'
								value={confirmPassword}
								onChange={(event) => {
									setConfirmPassword(event.target.value);
									setErrorMessage("");
								}}
								autoComplete='new-password'
							/>
							<button
								type='button'
								className='auth-input-toggle'
								onClick={() => setShowConfirmPassword((current) => !current)}
								aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
							>
								{showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
							</button>
						</div>
					</div>

					<div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
						<Link to='/login' className='auth-inline-link'>
							Back to login
						</Link>
						<span className='text-slate-500'>This screen works only with a valid reset link.</span>
					</div>

					<button className='auth-button' disabled={loading || !token}>
						{loading ? (
							<span className='loading loading-spinner'></span>
						) : (
							<>
								<span>Save new password</span>
								<FiArrowRight size={18} />
							</>
						)}
					</button>

					{errorMessage ? <p className='auth-error-text'>{errorMessage}</p> : null}
					{successMessage ? (
						<div className='rounded-[20px] border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-900'>
							<div className='flex items-start gap-2 text-emerald-800'>
								<FiCheckCircle className='mt-0.5 shrink-0' />
								<div>
									<p className='font-semibold'>{successMessage}</p>
									<p className='mt-1 text-emerald-700'>
										Your password has been updated. You can now return to login and access your account.
									</p>
								</div>
							</div>
						</div>
					) : null}
				</form>
			</AuthShell>
		</div>
	);
};

export default ResetPassword;
