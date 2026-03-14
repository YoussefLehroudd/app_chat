import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../../components/auth/AuthShell";

const VerifyEmail = () => {
	const [searchParams] = useSearchParams();
	const [status, setStatus] = useState("idle");
	const [message, setMessage] = useState("");

	const token = searchParams.get("token") || "";

	useEffect(() => {
		if (!token) {
			setStatus("error");
			setMessage("This verification link is missing its token.");
			return;
		}

		let isCancelled = false;

		const verify = async () => {
			setStatus("loading");
			try {
				const response = await fetch("/api/auth/verify-email", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ token }),
				});
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Unable to verify email");
				}

				if (!isCancelled) {
					setStatus("success");
					setMessage(data.message || "Email verified successfully");
				}
			} catch (error) {
				if (!isCancelled) {
					setStatus("error");
					setMessage(error.message);
				}
			}
		};

		void verify();

		return () => {
			isCancelled = true;
		};
	}, [token]);

	return (
		<div className='flex h-full w-full max-w-6xl items-center'>
			<AuthShell
				eyebrow='Email verification'
				title='Confirm your email'
				accent='Secure account recovery'
				description='We are checking your verification link now. Once it succeeds, your account can use email verification and 2FA setup.'
				footerPrompt='Back to access'
				footerLinkLabel='Login'
				footerTo='/login'
			>
				<div className='auth-form-stack flex flex-col gap-4'>
					<div className='rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-200'>
						{status === "loading" ? "Verifying your email..." : message}
					</div>

					<Link
						to='/login'
						className='auth-button inline-flex items-center justify-center'
					>
						Go to login
					</Link>
				</div>
			</AuthShell>
		</div>
	);
};

export default VerifyEmail;
