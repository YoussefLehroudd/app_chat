import { createContext, useState, useEffect, useContext } from "react";
import { useAuthContext } from "./AuthContext";
import io from "socket.io-client";
import toast from "react-hot-toast";
import useConversation from "../zustand/useConversation";

const SocketContext = createContext();
const CONVERSATIONS_REFRESH_EVENT = "chat:conversations-refresh";

export const useSocketContext = () => {
	return useContext(SocketContext);
};

export const SocketContextProvider = ({ children }) => {
	const [socket, setSocket] = useState(null);
	const [isSocketConnected, setIsSocketConnected] = useState(false);
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

			socket.on("connect", () => {
				setIsSocketConnected(true);
			});

			socket.on("disconnect", () => {
				setIsSocketConnected(false);
				setOnlineUsers([]);
			});

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

			socket.on("sessionUserUpdated", (nextUser) => {
				if (!nextUser?._id) return;

				useConversation.getState().applyUserUpdate(nextUser);
				localStorage.setItem("chat-user", JSON.stringify(nextUser));
				setAuthUser(nextUser);
			});

			socket.on("publicUserUpdated", (nextUser) => {
				if (!nextUser?._id) return;
				useConversation.getState().applyUserUpdate(nextUser);
			});

			socket.on("conversationsRefreshRequired", () => {
				window.dispatchEvent(new Event(CONVERSATIONS_REFRESH_EVENT));
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
				setIsSocketConnected(false);
				socket.off("getOnlineUsers");
				socket.off("userLastSeen");
				socket.off("deleteMessage");
				socket.off("sessionUserUpdated");
				socket.off("publicUserUpdated");
				socket.off("conversationsRefreshRequired");
				socket.off("accountRemoved");
				socket.off("connect");
				socket.off("disconnect");
				socket.close();
			};
		} else {
			if (socket) {
				socket.close();
				setSocket(null);
			}
			setIsSocketConnected(false);
			setOnlineUsers([]);
			setLastSeenByUser({});
		}
	}, [authUser, setAuthUser]);

	return (
		<SocketContext.Provider value={{ socket, isSocketConnected, onlineUsers, lastSeenByUser }}>
			{children}
		</SocketContext.Provider>
	);
};
