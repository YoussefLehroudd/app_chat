import { useState } from "react";
import { useAuthContext } from "../context/AuthContext";

const useLogin = () => {
	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState({});
	const { setAuthUser } = useAuthContext();

	const login = async (username, password) => {
		const validationErrors = validateLoginInputs(username, password);
		if (Object.keys(validationErrors).length > 0) {
			setErrors(validationErrors);
			return false;
		}

		setErrors({});
		setLoading(true);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			const data = await res.json();
			if (data.error) {
				setErrors(mapLoginErrorToFields(data.error));
				return false;
			}

			localStorage.setItem("chat-user", JSON.stringify(data));
			setAuthUser(data);
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
			if (!currentErrors[field] && !currentErrors.form) return currentErrors;
			const nextErrors = { ...currentErrors };
			delete nextErrors[field];
			delete nextErrors.form;
			return nextErrors;
		});
	};

	return { loading, login, errors, clearError };
};
export default useLogin;

function validateLoginInputs(username, password) {
	const errors = {};

	if (!username || !password) {
		if (!username) errors.username = "Username is required";
		if (!password) errors.password = "Password is required";
	}

	return errors;
}

function mapLoginErrorToFields(message) {
	const normalizedMessage = message?.toLowerCase() || "";

	if (normalizedMessage.includes("invalid username or password")) {
		return { password: "Invalid username or password" };
	}

	return { form: message || "Unable to login" };
}
