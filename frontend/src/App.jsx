import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import Home from "./pages/home/Home";
import Login from "./pages/login/Login";
import SignUp from "./pages/signup/SignUp";
import Profile from "./pages/profile/Profile";
import DeveloperDashboard from "./pages/developer/DeveloperDashboard";
import { Toaster } from "react-hot-toast";
import { useAuthContext } from "./context/AuthContext";

function App() {
	const { authUser } = useAuthContext();
	const location = useLocation();
	const isAuthRoute = location.pathname === "/login" || location.pathname === "/signup";
	const isWorkbenchRoute = location.pathname === "/profile" || location.pathname === "/developer";

	return (
		<div
			className={`box-border flex min-h-screen ${
				isAuthRoute
					? "h-dvh items-start justify-center overflow-y-auto overflow-x-hidden px-2 py-2 sm:px-4 sm:py-4 lg:items-center lg:overflow-hidden lg:px-6 lg:py-6"
					: isWorkbenchRoute
						? "h-dvh items-center justify-center overflow-hidden p-2 sm:p-4"
					: "h-dvh items-center justify-center overflow-hidden p-2 sm:p-4"
			}`}
		>
			<Routes>
				<Route path='/' element={authUser ? <Home /> : <Navigate to={"/login"} />} />
				<Route path='/login' element={authUser ? <Navigate to='/' /> : <Login />} />
				<Route path='/signup' element={authUser ? <Navigate to='/' /> : <SignUp />} />
				<Route path='/profile' element={authUser ? <Profile /> : <Navigate to={"/login"} />} />
				<Route
					path='/developer'
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
		</div>
	);
}

export default App;
