import GenderCheckbox from "./GenderCheckbox";
import { useEffect, useState } from "react";
import useSignup from "../../hooks/useSignup";
import AuthShell from "../../components/auth/AuthShell";
import { FiArrowRight, FiAtSign, FiEye, FiEyeOff, FiLock, FiMail, FiUser } from "react-icons/fi";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const DEFAULT_USERNAME_STATUS = {
	state: "idle",
	message: "",
	suggestion: "",
	checkedValue: "",
};

const SignUp = () => {
	const [inputs, setInputs] = useState({
		fullName: "",
		username: "",
		email: "",
		password: "",
		confirmPassword: "",
		gender: "",
	});
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [usernameStatus, setUsernameStatus] = useState(DEFAULT_USERNAME_STATUS);

	const { loading, signup, errors, clearError } = useSignup();

	const handleCheckboxChange = (gender) => {
		clearError("gender");
		setInputs({ ...inputs, gender });
	};

	const handleChange = (field) => (e) => {
		const value = field === "username" ? e.target.value.toLowerCase() : e.target.value;
		clearError(field);
		if (field === "password" || field === "confirmPassword") {
			clearError("password");
			clearError("confirmPassword");
		}
		setInputs((currentInputs) => ({ ...currentInputs, [field]: value }));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		await signup(inputs);
	};

	const applySuggestedUsername = () => {
		const nextUsername = errors.usernameSuggestion || usernameStatus.suggestion;
		if (!nextUsername) return;
		clearError("username");
		setInputs((currentInputs) => ({
			...currentInputs,
			username: nextUsername,
		}));
	};

	useEffect(() => {
		const normalizedUsername = typeof inputs.username === "string" ? inputs.username.trim() : "";

		if (!normalizedUsername) {
			setUsernameStatus(DEFAULT_USERNAME_STATUS);
			return undefined;
		}

		if (!USERNAME_PATTERN.test(normalizedUsername)) {
			setUsernameStatus({
				state: "invalid",
				message: "Use 3-20 chars: letters, numbers, or _",
				suggestion: "",
				checkedValue: normalizedUsername,
			});
			return undefined;
		}

		const controller = new AbortController();
		const timeoutId = window.setTimeout(async () => {
			setUsernameStatus((currentStatus) => ({
				state: "checking",
				message:
					currentStatus.checkedValue === normalizedUsername && currentStatus.state === "checking"
						? currentStatus.message
						: "Checking username...",
				suggestion: "",
				checkedValue: normalizedUsername,
			}));

			try {
				const response = await fetch(`/api/auth/check-username?username=${encodeURIComponent(normalizedUsername)}`, {
					signal: controller.signal,
				});
				const data = await response.json();

				if (!response.ok) {
					throw new Error(data?.error || "Unable to check username");
				}

				setUsernameStatus({
					state: data.available ? "available" : data.valid === false ? "invalid" : "taken",
					message: data.message || (data.available ? "Username is available" : "Username is already taken"),
					suggestion: data.suggestion || "",
					checkedValue: normalizedUsername,
				});
			} catch (error) {
				if (error.name === "AbortError") return;
				setUsernameStatus({
					state: "error",
					message: "Could not verify username right now",
					suggestion: "",
					checkedValue: normalizedUsername,
				});
			}
		}, 320);

		return () => {
			controller.abort();
			window.clearTimeout(timeoutId);
		};
	}, [inputs.username]);

	return (
		<div className='flex h-full w-full max-w-6xl items-center'>
			<AuthShell
				eyebrow='Create account'
				title='Join the flow'
				accent='Start on ChatApp'
				description='Create your account and start chatting.'
				footerPrompt='Have an account?'
				footerLinkLabel='Login'
				footerTo='/login'
				shellVariant='compact'
				shellClassName='auth-shell--signup'
			>
				<form onSubmit={handleSubmit} className='auth-form-stack flex flex-col gap-4'>
					<div className='auth-form-grid grid gap-3 min-[360px]:grid-cols-2 lg:grid-cols-2'>
						<div className='space-y-2'>
							<label className='auth-label'>Full Name</label>
							<div className={`auth-input-wrap ${errors.fullName ? "auth-input-wrap--error" : ""}`}>
								<FiUser className='auth-input-icon' />
								<input
									type='text'
									placeholder='John Doe'
									className='auth-input'
									value={inputs.fullName}
									onChange={handleChange("fullName")}
									autoComplete='name'
									aria-invalid={Boolean(errors.fullName)}
								/>
							</div>
							{errors.fullName ? <p className='auth-error-text'>{errors.fullName}</p> : null}
						</div>

						<div className='space-y-2'>
							<label className='auth-label'>Username</label>
							<div className={`auth-input-wrap ${errors.username ? "auth-input-wrap--error" : ""}`}>
								<FiAtSign className='auth-input-icon' />
								<input
									type='text'
									placeholder='johndoe'
									className='auth-input'
									value={inputs.username}
									onChange={handleChange("username")}
									autoComplete='username'
									aria-invalid={Boolean(errors.username)}
								/>
							</div>
							{errors.username || errors.usernameSuggestion ? (
								<div className='auth-inline-feedback'>
									{errors.username ? <p className='auth-error-text'>{errors.username}</p> : null}
									{errors.usernameSuggestion ? (
										<button type='button' className='auth-suggestion-chip' onClick={applySuggestedUsername}>
											Try `@{errors.usernameSuggestion}`
										</button>
									) : null}
								</div>
							) : usernameStatus.state !== "idle" ? (
								<div className='auth-inline-feedback'>
									<p
										className={`auth-status-text ${
											usernameStatus.state === "available"
												? "auth-status-text--available"
												: usernameStatus.state === "checking"
													? "auth-status-text--checking"
													: usernameStatus.state === "error"
														? "auth-status-text--error"
														: "auth-status-text--taken"
										}`}
									>
										{usernameStatus.message}
									</p>
									{usernameStatus.suggestion && usernameStatus.state === "taken" ? (
										<button type='button' className='auth-suggestion-chip' onClick={applySuggestedUsername}>
											Use `@{usernameStatus.suggestion}`
										</button>
									) : null}
								</div>
							) : null}
						</div>
					</div>

					<div className='space-y-2'>
						<label className='auth-label'>Recovery Email</label>
						<div className={`auth-input-wrap ${errors.email ? "auth-input-wrap--error" : ""}`}>
							<FiMail className='auth-input-icon' />
							<input
								type='email'
								placeholder='you@example.com'
								className='auth-input'
								value={inputs.email}
								onChange={handleChange("email")}
								autoComplete='email'
								aria-invalid={Boolean(errors.email)}
							/>
						</div>
						{errors.email ? <p className='auth-error-text'>{errors.email}</p> : null}
					</div>

					<div className='auth-form-grid grid gap-3 min-[360px]:grid-cols-2 md:grid-cols-2'>
						<div className='space-y-2'>
							<label className='auth-label'>Password</label>
							<div className={`auth-input-wrap ${errors.password ? "auth-input-wrap--error" : ""}`}>
								<FiLock className='auth-input-icon' />
								<input
									type={showPassword ? "text" : "password"}
									placeholder='Enter password'
									className='auth-input'
									value={inputs.password}
									onChange={handleChange("password")}
									autoComplete='new-password'
									aria-invalid={Boolean(errors.password)}
								/>
								<button
									type='button'
									className='auth-input-toggle'
									onClick={() => setShowPassword((currentShowPassword) => !currentShowPassword)}
									aria-label={showPassword ? "Hide password" : "Show password"}
									title={showPassword ? "Hide password" : "Show password"}
								>
									{showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
								</button>
							</div>
							{errors.password ? <p className='auth-error-text'>{errors.password}</p> : null}
						</div>

						<div className='space-y-2'>
							<label className='auth-label'>Confirm Password</label>
							<div className={`auth-input-wrap ${errors.confirmPassword ? "auth-input-wrap--error" : ""}`}>
								<FiLock className='auth-input-icon' />
								<input
									type={showConfirmPassword ? "text" : "password"}
									placeholder='Confirm password'
									className='auth-input'
									value={inputs.confirmPassword}
									onChange={handleChange("confirmPassword")}
									autoComplete='new-password'
									aria-invalid={Boolean(errors.confirmPassword)}
								/>
								<button
									type='button'
									className='auth-input-toggle'
									onClick={() =>
										setShowConfirmPassword((currentShowConfirmPassword) => !currentShowConfirmPassword)
									}
									aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
									title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
								>
									{showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
								</button>
							</div>
							{errors.confirmPassword ? <p className='auth-error-text'>{errors.confirmPassword}</p> : null}
						</div>
					</div>

					<GenderCheckbox onCheckboxChange={handleCheckboxChange} selectedGender={inputs.gender} error={errors.gender} />

					<button className='auth-button' disabled={loading}>
						{loading ? (
							<span className='loading loading-spinner'></span>
						) : (
							<>
								<span>Create account</span>
								<FiArrowRight size={18} />
							</>
						)}
					</button>
					{errors.form ? <p className='auth-error-text'>{errors.form}</p> : null}
				</form>
			</AuthShell>
		</div>
	);
};
export default SignUp;

// STARTER CODE FOR THE SIGNUP COMPONENT
// import GenderCheckbox from "./GenderCheckbox";

// const SignUp = () => {
// 	return (
// 		<div className='flex flex-col items-center justify-center min-w-96 mx-auto'>
// 			<div className='w-full p-6 rounded-lg shadow-md bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
// 				<h1 className='text-3xl font-semibold text-center text-gray-300'>
// 					Sign Up <span className='text-blue-500'> ChatApp</span>
// 				</h1>

// 				<form>
// 					<div>
// 						<label className='label p-2'>
// 							<span className='text-base label-text'>Full Name</span>
// 						</label>
// 						<input type='text' placeholder='John Doe' className='w-full input input-bordered  h-10' />
// 					</div>

// 					<div>
// 						<label className='label p-2 '>
// 							<span className='text-base label-text'>Username</span>
// 						</label>
// 						<input type='text' placeholder='johndoe' className='w-full input input-bordered h-10' />
// 					</div>

// 					<div>
// 						<label className='label'>
// 							<span className='text-base label-text'>Password</span>
// 						</label>
// 						<input
// 							type='password'
// 							placeholder='Enter Password'
// 							className='w-full input input-bordered h-10'
// 						/>
// 					</div>

// 					<div>
// 						<label className='label'>
// 							<span className='text-base label-text'>Confirm Password</span>
// 						</label>
// 						<input
// 							type='password'
// 							placeholder='Confirm Password'
// 							className='w-full input input-bordered h-10'
// 						/>
// 					</div>

// 					<GenderCheckbox />

// 					<a className='text-sm hover:underline hover:text-blue-600 mt-2 inline-block' href='#'>
// 						Already have an account?
// 					</a>

// 					<div>
// 						<button className='btn btn-block btn-sm mt-2 border border-slate-700'>Sign Up</button>
// 					</div>
// 				</form>
// 			</div>
// 		</div>
// 	);
// };
// export default SignUp;
