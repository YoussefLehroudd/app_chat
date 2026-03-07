import { createContext, useState, useEffect, useContext } from "react";
import { useAuthContext } from "./AuthContext";
import io from "socket.io-client";
import toast from "react-hot-toast";
import useConversation from "../zustand/useConversation";

const SocketContext = createContext();

export const useSocketContext = () => {
	return useContext(SocketContext);
};

export const SocketContextProvider = ({ children }) => {
	const [socket, setSocket] = useState(null);
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [lastSeenByUser, setLastSeenByUser] = useState({});
	const { authUser, setAuthUser } = useAuthContext();

	useEffect(() => {
		if (authUser) {
			const socket = io(import.meta.env.VITE_API_URL || "http://localhost:5001", {
				query: {
					userId: authUser._id,
				},
			});

			setSocket(socket);

			// socket.on() is used to listen to the events. can be used both on client and server side
			socket.on("getOnlineUsers", (users) => {
				setOnlineUsers(users);
			});

			socket.on("userLastSeen", ({ userId, lastSeen }) => {
				setLastSeenByUser((currentState) => ({
					...currentState,
					[userId]: lastSeen,
				}));
			});

			// Add listener for deleteMessage event to update UI live
			socket.on("deleteMessage", ({ messageId }) => {
				useConversation.getState().removeMessage(messageId);
			});

			socket.on("accountRemoved", ({ reason } = {}) => {
				if (reason === "archived") {
					toast.error("Your account has been banned.");
				} else if (reason === "banned") {
					toast.error("Your account has been banned.");
				} else {
					toast.error("Your account is no longer available.");
				}
				localStorage.removeItem("chat-user");
				localStorage.removeItem("chat-conversations");
				setAuthUser(null);
			});

			return () => {
				socket.off("getOnlineUsers");
				socket.off("userLastSeen");
				socket.off("deleteMessage");
				socket.off("accountRemoved");
				socket.close();
			};
		} else {
			if (socket) {
				socket.close();
				setSocket(null);
			}
			setOnlineUsers([]);
			setLastSeenByUser({});
		}
	}, [authUser, setAuthUser]);

	return <SocketContext.Provider value={{ socket, onlineUsers, lastSeenByUser }}>{children}</SocketContext.Provider>;
};
