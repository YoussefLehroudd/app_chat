import { useState } from "react";
import { useAuthContext } from "../context/AuthContext";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const useSignup = () => {
	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState({});
	const { setAuthUser } = useAuthContext();

	const signup = async ({ fullName, username, email, password, confirmPassword, gender }) => {
		const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
		const validationErrors = validateSignupInputs({
			fullName,
			username: normalizedUsername,
			email,
			password,
			confirmPassword,
			gender,
		});
		if (Object.keys(validationErrors).length > 0) {
			setErrors(validationErrors);
			return false;
		}

		setErrors({});
		setLoading(true);
		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fullName, username: normalizedUsername, email, password, confirmPassword, gender }),
			});

			const data = await res.json();
			if (data.error) {
				setErrors(mapSignupErrorToFields(data));
				return false;
			}

			const sessionUser = await establishSignupSession({ username: normalizedUsername, password }, data);
			localStorage.setItem("chat-user", JSON.stringify(sessionUser));
			setAuthUser(sessionUser);
			window.dispatchEvent(new Event("chat:conversations-refresh"));
			setErrors({});
			return true;
		} catch (error) {
			setErrors({ form: "Something went wrong. Please try again." });
			return false;
		} finally {
			setLoading(false);
		}
	};

	const clearError = (field) => {
		setErrors((currentErrors) => {
			if (!currentErrors[field] && !currentErrors.form && !(field === "username" && currentErrors.usernameSuggestion)) {
				return currentErrors;
			}
			const nextErrors = { ...currentErrors };
			delete nextErrors[field];
			if (field === "username") {
				delete nextErrors.usernameSuggestion;
			}
			delete nextErrors.form;
			return nextErrors;
		});
	};

	return { loading, signup, errors, clearError };
};
export default useSignup;

async function establishSignupSession({ username, password }, fallbackUser) {
	try {
		const loginResponse = await fetch("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});

		const loginData = await loginResponse.json();
		if (loginResponse.ok && !loginData.error) {
			return loginData;
		}
	} catch {
		// Keep signup response user if auto-login refresh fails.
	}

	return fallbackUser;
}

function validateSignupInputs({ fullName, username, email, password, confirmPassword, gender }) {
	const errors = {};
	const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
	const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

	if (!fullName || !username || !email || !password || !confirmPassword || !gender) {
		if (!fullName) errors.fullName = "Full name is required";
		if (!username) errors.username = "Username is required";
		if (!email) errors.email = "Email is required";
		if (!password) errors.password = "Password is required";
		if (!confirmPassword) errors.confirmPassword = "Please confirm your password";
		if (!gender) errors.gender = "Please choose a gender";
	}

	if (password !== confirmPassword) {
		errors.confirmPassword = "Passwords do not match";
	}

	if (password && password.length < 6) {
		errors.password = "Password must be at least 6 characters";
	}

	if (normalizedUsername && !USERNAME_PATTERN.test(normalizedUsername)) {
		errors.username = "Use 3-20 chars: letters, numbers, or _";
	}

	if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
		errors.email = "Please enter a valid email address";
	}

	return errors;
}

function mapSignupErrorToFields(response) {
	const message = response?.error || "";
	const normalizedMessage = message.toLowerCase();

	if (normalizedMessage.includes("username already exists")) {
		return {
			username: "Username already exists",
			usernameSuggestion: response?.suggestion || "",
		};
	}

	if (normalizedMessage.includes("letters, numbers, or _")) {
		return { username: "Use 3-20 chars: letters, numbers, or _" };
	}

	if (normalizedMessage.includes("email already exists")) {
		return { email: "Email already exists" };
	}

	if (normalizedMessage.includes("valid email")) {
		return { email: "Please enter a valid email address" };
	}

	if (normalizedMessage.includes("password") && normalizedMessage.includes("match")) {
		return { confirmPassword: "Passwords do not match" };
	}

	return { form: message || "Unable to create account" };
}
