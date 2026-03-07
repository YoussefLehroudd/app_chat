import { useState } from "react";
import useLogin from "../../hooks/useLogin";
import AuthShell from "../../components/auth/AuthShell";
import { FiArrowRight, FiAtSign, FiLock } from "react-icons/fi";

const Login = () => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const { loading, login, errors, clearError } = useLogin();

	const handleUsernameChange = (e) => {
		clearError("username");
		setUsername(e.target.value);
	};

	const handlePasswordChange = (e) => {
		clearError("password");
		setPassword(e.target.value);
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		await login(username, password);
	};

	return (
		<div className='w-full max-w-6xl'>
			<AuthShell
				eyebrow='Realtime chat'
				title='Welcome back'
				accent='Login to ChatApp'
				description='Access your conversations, presence, and profile from one clean entry point.'
				footerPrompt={"Don't have an account?"}
				footerLinkLabel='Create one'
				footerTo='/signup'
			>
				<form onSubmit={handleSubmit} className='auth-form-stack flex flex-col gap-4'>
					<div className='space-y-2'>
						<label className='auth-label'>Username</label>
						<div className={`auth-input-wrap ${errors.username ? "auth-input-wrap--error" : ""}`}>
							<FiAtSign className='auth-input-icon' />
							<input
								type='text'
								placeholder='Enter your username'
								className='auth-input'
								value={username}
								onChange={handleUsernameChange}
								autoComplete='username'
								aria-invalid={Boolean(errors.username)}
							/>
						</div>
						{errors.username ? <p className='auth-error-text'>{errors.username}</p> : null}
					</div>

					<div className='space-y-2'>
						<label className='auth-label'>Password</label>
						<div className={`auth-input-wrap ${errors.password ? "auth-input-wrap--error" : ""}`}>
							<FiLock className='auth-input-icon' />
							<input
								type='password'
								placeholder='Enter your password'
								className='auth-input'
								value={password}
								onChange={handlePasswordChange}
								autoComplete='current-password'
								aria-invalid={Boolean(errors.password)}
							/>
						</div>
						{errors.password ? <p className='auth-error-text'>{errors.password}</p> : null}
					</div>

					<button className='auth-button' disabled={loading}>
						{loading ? (
							<span className='loading loading-spinner'></span>
						) : (
							<>
								<span>Login</span>
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
export default Login;

// STARTER CODE FOR THIS FILE
// const Login = () => {
// 	return (
// 		<div className='flex flex-col items-center justify-center min-w-96 mx-auto'>
// 			<div className='w-full p-6 rounded-lg shadow-md bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
// 				<h1 className='text-3xl font-semibold text-center text-gray-300'>
// 					Login
// 					<span className='text-blue-500'> ChatApp</span>
// 				</h1>

// 				<form>
// 					<div>
// 						<label className='label p-2'>
// 							<span className='text-base label-text'>Username</span>
// 						</label>
// 						<input type='text' placeholder='Enter username' className='w-full input input-bordered h-10' />
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
// 					<a href='#' className='text-sm  hover:underline hover:text-blue-600 mt-2 inline-block'>
// 						{"Don't"} have an account?
// 					</a>

// 					<div>
// 						<button className='btn btn-block btn-sm mt-2'>Login</button>
// 					</div>
// 				</form>
// 			</div>
// 		</div>
// 	);
// };
// export default Login;
