import { useEffect, useState } from "react";
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
	const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
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
	const mobileViewportShell = `h-[var(--app-viewport-height)] items-start justify-center overflow-x-hidden overflow-y-auto px-1.5 ${
		isMobileKeyboardOpen
			? "pt-1 pb-1"
			: "pt-[calc(env(safe-area-inset-top,0px)+0.35rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)]"
	}`;
	const mobileDesktopShell = "sm:h-dvh sm:items-center sm:overflow-hidden sm:p-4";
	const appShellClass = isAuthRoute
		? `box-border flex min-h-[var(--app-viewport-height)] ${mobileViewportShell} sm:px-4 sm:py-4 lg:px-6 lg:py-6`
		: isWorkbenchRoute
			? isDeveloperRoute
				? `box-border flex min-h-[var(--app-viewport-height)] ${mobileViewportShell} sm:min-h-screen sm:h-auto sm:p-4 xl:h-dvh xl:items-center xl:overflow-hidden`
				: `box-border flex min-h-[var(--app-viewport-height)] ${mobileViewportShell} ${mobileDesktopShell}`
			: `box-border flex min-h-[var(--app-viewport-height)] ${mobileViewportShell} ${mobileDesktopShell}`;
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
			const layoutViewportHeight = window.innerHeight;
			const viewportHeight = window.visualViewport?.height || window.innerHeight;
			const viewportOffsetTop = window.visualViewport?.offsetTop || 0;
			if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
			root.style.setProperty("--app-viewport-height", `${Math.round(viewportHeight)}px`);

			const keyboardHeight = Math.max(0, layoutViewportHeight - viewportHeight - viewportOffsetTop);
			const keyboardOpen = window.innerWidth < 1024 && keyboardHeight > 120;
			setIsMobileKeyboardOpen(keyboardOpen);
			root.setAttribute("data-mobile-keyboard", keyboardOpen ? "open" : "closed");
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
			root.setAttribute("data-mobile-keyboard", "closed");
		};
	}, []);

	return (
		<div className={appShellClass}>
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
