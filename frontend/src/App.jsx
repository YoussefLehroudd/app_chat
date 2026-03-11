import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import Home from "./pages/home/Home";
import Login from "./pages/login/Login";
import SignUp from "./pages/signup/SignUp";
import Profile from "./pages/profile/Profile";
import DeveloperDashboard from "./pages/developer/DeveloperDashboard";
import VoiceCallOverlay from "./components/calls/VoiceCallOverlay";
import { Toaster } from "react-hot-toast";
import { useAuthContext } from "./context/AuthContext";

function App() {
	const { authUser } = useAuthContext();
	const location = useLocation();
	const isAuthRoute = location.pathname === "/login" || location.pathname === "/signup";
	const authSwitchFrom = location.state?.authSwitchFrom;
	const authSwitchDirection =
		location.pathname === "/signup" && authSwitchFrom === "/login"
			? "forward"
			: location.pathname === "/login" && authSwitchFrom === "/signup"
				? "backward"
				: "neutral";
	const isDeveloperRoute = location.pathname.startsWith("/developer");
	const isWorkbenchRoute = location.pathname === "/profile" || location.pathname.startsWith("/developer");
	const renderAuthRoute = (screen) => (
		<div key={`${location.pathname}-${location.key}`} className={`auth-route-transition auth-route-transition--${authSwitchDirection}`}>
			{screen}
		</div>
	);

	useEffect(() => {
		if (typeof window === "undefined" || typeof document === "undefined") {
			return undefined;
		}

		const root = document.documentElement;
		const updateViewportHeight = () => {
			const viewportHeight = window.visualViewport?.height || window.innerHeight;
			if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
			root.style.setProperty("--app-viewport-height", `${Math.round(viewportHeight)}px`);
		};

		updateViewportHeight();
		window.addEventListener("resize", updateViewportHeight);
		window.addEventListener("orientationchange", updateViewportHeight);
		window.visualViewport?.addEventListener("resize", updateViewportHeight);
		window.visualViewport?.addEventListener("scroll", updateViewportHeight);

		return () => {
			window.removeEventListener("resize", updateViewportHeight);
			window.removeEventListener("orientationchange", updateViewportHeight);
			window.visualViewport?.removeEventListener("resize", updateViewportHeight);
			window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
		};
	}, []);

	return (
		<div
			className={`box-border flex min-h-screen ${
				isAuthRoute
					? "h-dvh items-start justify-center overflow-y-auto overflow-x-hidden px-2 py-2 sm:px-4 sm:py-4 lg:items-center lg:overflow-hidden lg:px-6 lg:py-6"
					: isWorkbenchRoute
						? isDeveloperRoute
							? "min-h-[var(--app-viewport-height)] items-start justify-center overflow-x-hidden p-1.5 sm:min-h-screen sm:p-4 xl:h-dvh xl:items-center xl:overflow-hidden"
							: "h-[var(--app-viewport-height)] items-start justify-center overflow-hidden p-1.5 sm:h-dvh sm:items-center sm:p-4"
						: "h-[var(--app-viewport-height)] items-start justify-center overflow-hidden p-1.5 sm:h-dvh sm:items-center sm:p-4"
			}`}
		>
			<Routes>
				<Route path='/' element={authUser ? <Home /> : <Navigate to={"/login"} />} />
				<Route path='/login' element={authUser ? <Navigate to='/' /> : renderAuthRoute(<Login />)} />
				<Route path='/signup' element={authUser ? <Navigate to='/' /> : renderAuthRoute(<SignUp />)} />
				<Route path='/profile' element={authUser ? <Profile /> : <Navigate to={"/login"} />} />
				<Route
					path='/developer/*'
					element={
						authUser ? (
							authUser.role === "DEVELOPER" ? <DeveloperDashboard /> : <Navigate to='/' />
						) : (
							<Navigate to={"/login"} />
						)
					}
				/>
			</Routes>
			<Toaster />
			<VoiceCallOverlay />
		</div>
	);
}

export default App;
