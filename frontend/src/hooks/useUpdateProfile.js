import { useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";

const useUpdateProfile = () => {
	const [loading, setLoading] = useState(false);
	const { authUser, setAuthUser } = useAuthContext();

	const updateProfile = async ({
		fullName,
		username,
		gender,
		bio,
		profilePicFile,
		currentPassword,
		newPassword,
		confirmPassword,
	}) => {
		setLoading(true);
		try {
			const formData = new FormData();
			if (fullName !== undefined) formData.append("fullName", fullName);
			if (username !== undefined) formData.append("username", username);
			if (gender !== undefined) formData.append("gender", gender);
			if (bio !== undefined) formData.append("bio", bio);
			if (profilePicFile) formData.append("profilePic", profilePicFile);

			if (currentPassword || newPassword || confirmPassword) {
				formData.append("currentPassword", currentPassword || "");
				formData.append("newPassword", newPassword || "");
				formData.append("confirmPassword", confirmPassword || "");
			}

			const res = await fetch("/api/users/profile", {
				method: "PUT",
				body: formData,
			});

			const data = await res.json();
			if (data.error) {
				throw new Error(data.error);
			}

			const updatedUser = { ...authUser, ...data };
			localStorage.setItem("chat-user", JSON.stringify(updatedUser));
			setAuthUser(updatedUser);
			toast.success("Profile updated");
			return updatedUser;
		} catch (error) {
			toast.error(error.message);
			return null;
		} finally {
			setLoading(false);
		}
	};

	return { loading, updateProfile };
};

export default useUpdateProfile;
