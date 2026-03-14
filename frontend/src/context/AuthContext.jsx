import { createContext, useContext, useEffect, useState } from "react";
import { preloadAvatar } from "../utils/avatar";

export const AuthContext = createContext();

const getUserId = (user) => user?._id || user?.id || null;

const normalizeAuthUser = (user) => {
	if (!user) return null;
	const userId = getUserId(user);
	if (!userId) return null;
	return {
		...user,
		_id: userId,
		id: userId,
		email: user.email || "",
		hasRecoveryEmail: Boolean(user.email || user.hasRecoveryEmail),
		role: user.role || "USER",
		isPrimaryDeveloper: user.isPrimaryDeveloper || false,
		isVerified: user.isVerified || false,
		developerPermissions: {
			fullAccess: Boolean(user.developerPermissions?.fullAccess),
			manageUsers: Boolean(user.developerPermissions?.manageUsers),
			editUserData: Boolean(user.developerPermissions?.editUserData),
			manageGroups: Boolean(user.developerPermissions?.manageGroups),
			manageReports: Boolean(user.developerPermissions?.manageReports),
			deleteGroups: Boolean(user.developerPermissions?.deleteGroups),
			deleteMessages: Boolean(user.developerPermissions?.deleteMessages),
			deleteReports: Boolean(user.developerPermissions?.deleteReports),
		},
	};
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => {
	return useContext(AuthContext);
};

export const AuthContextProvider = ({ children }) => {
	const [authUser, setAuthUserState] = useState(normalizeAuthUser(JSON.parse(localStorage.getItem("chat-user")) || null));

	const setAuthUser = (nextUser) => {
		if (typeof nextUser === "function") {
			setAuthUserState((currentUser) => normalizeAuthUser(nextUser(currentUser)));
			return;
		}

		setAuthUserState(normalizeAuthUser(nextUser));
	};

	useEffect(() => {
		let isCancelled = false;

		const syncSessionUser = async () => {
			try {
				const res = await fetch("/api/auth/session");

				if (!res.ok) {
					return;
				}

				const data = normalizeAuthUser(await res.json());
				if (isCancelled) return;

				if (!data) {
					localStorage.removeItem("chat-user");
					localStorage.removeItem("chat-conversations");
					setAuthUser(null);
					return;
				}

				localStorage.setItem("chat-user", JSON.stringify(data));
				setAuthUser(data);
			} catch {
				// Keep the locally restored session if the network request fails.
			}
		};

		syncSessionUser();

		return () => {
			isCancelled = true;
		};
	}, []);

	useEffect(() => {
		if (authUser?.profilePic) {
			preloadAvatar(authUser.profilePic, 96);
		}
	}, [authUser?.profilePic]);

	return <AuthContext.Provider value={{ authUser, setAuthUser }}>{children}</AuthContext.Provider>;
};
