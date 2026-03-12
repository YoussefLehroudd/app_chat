import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import Login from "./pages/login/Login";
import SignUp from "./pages/signup/SignUp";
import { Toaster, toast } from "react-hot-toast";
import { useAuthContext } from "./context/AuthContext";

const Home = lazy(() => import("./pages/home/Home"));
const Profile = lazy(() => import("./pages/profile/Profile"));
const DeveloperDashboard = lazy(() => import("./pages/developer/DeveloperDashboard"));
const VoiceCallOverlay = lazy(() => import("./components/calls/VoiceCallOverlay"));
const AuthenticatedProviders = lazy(() => import("./components/app/AuthenticatedProviders"));

const normalizeCopyUser = (value) => {
	const normalized = typeof value === "string" ? value.trim().replace(/^@+/, "") : "";
	return normalized ? `@${normalized}` : "";
};

const copyTextToClipboard = async (value) => {
	if (!value) return false;

	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(value);
		return true;
	}

	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "absolute";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	textarea.select();
	const copied = document.execCommand("copy");
	document.body.removeChild(textarea);
	return copied;
};

function App() {
	const { authUser } = useAuthContext();
	const location = useLocation();
	const [isMobileKeyboardOpen, setIsMobileKeyboardOpen] = useState(false);
	const lastCopiedUserRef = useRef({ value: "", at: 0 });
	const isAuthRoute = location.pathname === "/login" || location.pathname === "/signup";
	const isProfileRoute = location.pathname === "/profile";
	const authSwitchFrom = location.state?.authSwitchFrom;
	const authSwitchDirection =
		location.pathname === "/signup" && authSwitchFrom === "/login"
			? "forward"
			: location.pathname === "/login" && authSwitchFrom === "/signup"
				? "backward"
				: "neutral";
	const isDeveloperRoute = location.pathname.startsWith("/developer");
	const isWorkbenchRoute = isProfileRoute || location.pathname.startsWith("/developer");
	const mobileViewportShell = `h-[var(--app-viewport-height)] items-start justify-center overflow-x-hidden overflow-y-auto px-1.5 ${
		isMobileKeyboardOpen
			? "pt-1 pb-1"
			: "pt-[calc(env(safe-area-inset-top,0px)+0.35rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)]"
	}`;
	const mobileStaticShell = `items-start justify-center overflow-x-hidden px-1.5 ${
		isMobileKeyboardOpen
			? "pt-1 pb-1"
			: "pt-[calc(env(safe-area-inset-top,0px)+0.35rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)]"
	}`;
	const mobileDesktopShell = "sm:h-dvh sm:items-center sm:overflow-hidden sm:p-4";
	const profileDesktopShell = "sm:min-h-screen sm:items-start sm:p-4 lg:p-6";
	const appShellClass = isAuthRoute
		? `box-border flex min-h-[var(--app-viewport-height)] ${mobileViewportShell} sm:px-4 sm:py-4 lg:px-6 lg:py-6`
		: isWorkbenchRoute
			? isDeveloperRoute
				? `box-border flex min-h-[var(--app-viewport-height)] ${mobileViewportShell} sm:min-h-screen sm:h-auto sm:p-4 xl:h-dvh xl:items-center xl:overflow-hidden`
				: isProfileRoute
					? `box-border flex min-h-[var(--app-viewport-height)] ${mobileStaticShell} ${profileDesktopShell}`
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

	useEffect(() => {
		if (typeof document === "undefined") return;
		document.body.classList.toggle("app-auth-route", isAuthRoute);
	}, [isAuthRoute]);

	useEffect(() => {
		if (typeof document === "undefined") return;
		document.body.classList.toggle("app-profile-route", location.pathname === "/profile");
	}, [location.pathname]);

	useEffect(() => {
		if (typeof document === "undefined") return undefined;

		const handleCopyUserClick = (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (target.closest("input, textarea, select, [contenteditable='true']")) return;

			const selectedText = window.getSelection?.().toString().trim();
			if (selectedText) return;

			const copySource = target.closest("[data-copy-user]");
			if (!copySource) return;

			const userHandle = normalizeCopyUser(copySource.getAttribute("data-copy-user"));
			if (!userHandle) return;

			const now = Date.now();
			if (lastCopiedUserRef.current.value === userHandle && now - lastCopiedUserRef.current.at < 700) {
				return;
			}

			void copyTextToClipboard(userHandle)
				.then((copied) => {
					if (!copied) {
						throw new Error("copy-failed");
					}
					lastCopiedUserRef.current = { value: userHandle, at: now };
					toast.success(`${userHandle} copied`, { duration: 1200 });
				})
				.catch(() => {
					toast.error("Copy failed");
				});
		};

		document.addEventListener("click", handleCopyUserClick);
		return () => {
			document.removeEventListener("click", handleCopyUserClick);
		};
	}, []);

	return (
		<div className={appShellClass}>
			<Suspense fallback={null}>
				{authUser ? (
					<AuthenticatedProviders>
						<Routes>
							<Route path='/' element={<Home />} />
							<Route path='/login' element={<Navigate to='/' />} />
							<Route path='/signup' element={<Navigate to='/' />} />
							<Route path='/profile' element={<Profile />} />
							<Route
								path='/developer/*'
								element={authUser.role === "DEVELOPER" ? <DeveloperDashboard /> : <Navigate to='/' />}
							/>
						</Routes>
						<VoiceCallOverlay />
					</AuthenticatedProviders>
				) : (
					<Routes>
						<Route path='/' element={<Navigate to={"/login"} />} />
						<Route path='/login' element={renderAuthRoute(<Login />)} />
						<Route path='/signup' element={renderAuthRoute(<SignUp />)} />
						<Route path='/profile' element={<Navigate to={"/login"} />} />
						<Route path='/developer/*' element={<Navigate to={"/login"} />} />
					</Routes>
				)}
			</Suspense>
			<Toaster />
		</div>
	);
}

export default App;
