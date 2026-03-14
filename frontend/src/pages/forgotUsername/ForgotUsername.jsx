import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";
import { FiArrowRight, FiMail, FiUser } from "react-icons/fi";

const ForgotUsername = () => {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");

	const handleSubmit = async (event) => {
		event.preventDefault();
		setErrorMessage("");
		setSuccessMessage("");
		setLoading(true);

		try {
			const response = await fetch("/api/auth/forgot-username", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = await response.json();

			if (!response.ok || data.error) {
				setErrorMessage(data.error || "Unable to send username reminder");
				return;
			}

			setSuccessMessage(data.message || "If the account exists, a recovery email has been sent.");
		} catch {
			setErrorMessage("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='flex h-full w-full max-w-6xl items-center'>
			<AuthShell
				eyebrow='Username recovery'
				title='Recover your username'
				accent='Email reminder'
				description='Enter your recovery email and we will send the username for that account.'
				footerPrompt='Remembered it already?'
				footerLinkLabel='Back to login'
				footerTo='/login'
				shellVariant='compact'
			>
				<form onSubmit={handleSubmit} className='auth-form-stack flex flex-col gap-4'>
					<div className='space-y-2'>
						<label className='auth-label'>Recovery Email</label>
						<div className={`auth-input-wrap ${errorMessage ? "auth-input-wrap--error" : ""}`}>
							<FiMail className='auth-input-icon' />
							<input
								type='email'
								placeholder='you@example.com'
								className='auth-input'
								value={email}
								onChange={(event) => {
									setEmail(event.target.value);
									setErrorMessage("");
								}}
								autoComplete='email'
							/>
						</div>
					</div>

					<div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
						<Link to='/forgot-password' className='auth-inline-link'>
							Need a password reset too?
						</Link>
						<div className='inline-flex items-center gap-2 text-slate-500'>
							<FiUser size={14} />
							<span>Your username will be sent by email.</span>
						</div>
					</div>

					<button className='auth-button' disabled={loading}>
						{loading ? (
							<span className='loading loading-spinner'></span>
						) : (
							<>
								<span>Send username reminder</span>
								<FiArrowRight size={18} />
							</>
						)}
					</button>

					{errorMessage ? <p className='auth-error-text'>{errorMessage}</p> : null}
					{successMessage ? <p className='text-sm leading-6 text-emerald-700'>{successMessage}</p> : null}
				</form>
			</AuthShell>
		</div>
	);
};

export default ForgotUsername;
