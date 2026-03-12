import { CallContextProvider } from "../../context/CallContext";
import { SocketContextProvider } from "../../context/SocketContext";

const AuthenticatedProviders = ({ children }) => (
	<SocketContextProvider>
		<CallContextProvider>{children}</CallContextProvider>
	</SocketContextProvider>
);

export default AuthenticatedProviders;
