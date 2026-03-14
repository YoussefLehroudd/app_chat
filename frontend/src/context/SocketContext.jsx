import { createContext, useState, useEffect, useContext } from "react";
import { useAuthContext } from "./AuthContext";
import io from "socket.io-client";
import toast from "react-hot-toast";
import useConversation from "../zustand/useConversation";
import { showRequestErrorToast } from "../utils/requestFeedback";

const SocketContext = createContext();
const CONVERSATIONS_REFRESH_EVENT = "chat:conversations-refresh";
const BROADCAST_STORAGE_PREFIX = "chat-broadcasts";
const BROADCAST_STORAGE_LIMIT = 25;
const getUserId = (user) => user?._id || user?.id || null;
const getBroadcastStorageKey = (userId) => `${BROADCAST_STORAGE_PREFIX}:${userId}`;
const isValidDateValue = (value) => Number.isFinite(new Date(value).getTime());
const createBroadcastAnnouncementId = ({ title, content, sentAt }) =>
	[sentAt, title, content.slice(0, 120)]
		.map((value) => value.replace(/\s+/g, " ").trim().toLowerCase())
		.join("::");

const normalizeBroadcastAnnouncement = (announcement) => {
	const title = typeof announcement?.title === "string" ? announcement.title.trim() : "";
	const content = typeof announcement?.content === "string" ? announcement.content.trim() : "";

	if (!title || !content) return null;

	const sentAt = isValidDateValue(announcement?.sentAt) ? new Date(announcement.sentAt).toISOString() : new Date().toISOString();
	const receivedAt = isValidDateValue(announcement?.receivedAt)
		? new Date(announcement.receivedAt).toISOString()
		: sentAt;

	return {
		id:
			typeof announcement?.id === "string" && announcement.id.trim()
				? announcement.id.trim()
				: createBroadcastAnnouncementId({ title, content, sentAt }),
		title,
		content,
		audienceType:
			typeof announcement?.audienceType === "string" && announcement.audienceType.trim()
				? announcement.audienceType.trim().toUpperCase()
				: "ALL_USERS",
		sentAt,
		receivedAt,
		isRead: announcement?.isRead === true,
	};
};

const sanitizeBroadcastAnnouncements = (announcements) => {
	if (!Array.isArray(announcements)) return [];

	const seenIds = new Set();
	const normalizedAnnouncements = [];

	for (const announcement of announcements) {
		const normalizedAnnouncement = normalizeBroadcastAnnouncement(announcement);
		if (!normalizedAnnouncement || seenIds.has(normalizedAnnouncement.id)) {
			continue;
		}

		seenIds.add(normalizedAnnouncement.id);
		normalizedAnnouncements.push(normalizedAnnouncement);
	}

	return normalizedAnnouncements
		.sort((leftAnnouncement, rightAnnouncement) => new Date(rightAnnouncement.sentAt) - new Date(leftAnnouncement.sentAt))
		.slice(0, BROADCAST_STORAGE_LIMIT);
};

const readStoredBroadcastAnnouncements = (userId) => {
	if (!userId) return [];

	try {
		const storedValue = localStorage.getItem(getBroadcastStorageKey(userId));
		if (!storedValue) return [];
		return sanitizeBroadcastAnnouncements(JSON.parse(storedValue));
	} catch {
		return [];
	}
};

const writeStoredBroadcastAnnouncements = (userId, announcements) => {
	if (!userId) return;

	try {
		localStorage.setItem(getBroadcastStorageKey(userId), JSON.stringify(sanitizeBroadcastAnnouncements(announcements)));
	} catch {
		// Ignore storage write failures and keep the live state in memory.
	}
};

const trimBroadcastPreview = (content) => {
	const normalizedContent = content.replace(/\s+/g, " ").trim();
	if (normalizedContent.length <= 120) return normalizedContent;
	return `${normalizedContent.slice(0, 117)}...`;
};

export const useSocketContext = () => {
	return useContext(SocketContext);
};

export const SocketContextProvider = ({ children }) => {
	const [socket, setSocket] = useState(null);
	const [isSocketConnected, setIsSocketConnected] = useState(false);
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [lastSeenByUser, setLastSeenByUser] = useState({});
	const [broadcastAnnouncements, setBroadcastAnnouncements] = useState([]);
	const { authUser, setAuthUser } = useAuthContext();
	const authUserId = getUserId(authUser);
	const unreadBroadcastCount = broadcastAnnouncements.filter((announcement) => announcement.isRead !== true).length;

	const updateBroadcastAnnouncements = (nextAnnouncements) => {
		setBroadcastAnnouncements((currentAnnouncements) => {
			const resolvedAnnouncements =
				typeof nextAnnouncements === "function" ? nextAnnouncements(currentAnnouncements) : nextAnnouncements;
			const sanitizedAnnouncements = sanitizeBroadcastAnnouncements(resolvedAnnouncements);

			writeStoredBroadcastAnnouncements(authUserId, sanitizedAnnouncements);
			return sanitizedAnnouncements;
		});
	};

	const markBroadcastsRead = () => {
		updateBroadcastAnnouncements((currentAnnouncements) =>
			currentAnnouncements.map((announcement) =>
				announcement.isRead ? announcement : { ...announcement, isRead: true }
			)
		);
	};

	const dismissBroadcast = (broadcastId) => {
		if (!broadcastId) return;
		updateBroadcastAnnouncements((currentAnnouncements) =>
			currentAnnouncements.filter((announcement) => announcement.id !== broadcastId)
		);
	};

	const clearBroadcasts = () => {
		updateBroadcastAnnouncements([]);
	};

	useEffect(() => {
		if (!authUserId) {
			setBroadcastAnnouncements([]);
			return;
		}

		setBroadcastAnnouncements(readStoredBroadcastAnnouncements(authUserId));
	}, [authUserId]);

	useEffect(() => {
		if (authUserId) {
			const socket = io(import.meta.env.VITE_API_URL || "http://localhost:5001", {
				query: {
					userId: authUserId,
				},
				reconnectionDelay: 10000,
				reconnectionDelayMax: 10000,
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
				const nextUserId = getUserId(nextUser);
				if (!nextUserId) return;
				const normalizedNextUser = { ...nextUser, _id: nextUserId, id: nextUserId };

				useConversation.getState().applyUserUpdate(normalizedNextUser);
				localStorage.setItem("chat-user", JSON.stringify(normalizedNextUser));
				setAuthUser(normalizedNextUser);
			});

			socket.on("publicUserUpdated", (nextUser) => {
				const nextUserId = getUserId(nextUser);
				if (!nextUserId) return;
				useConversation.getState().applyUserUpdate({ ...nextUser, _id: nextUserId, id: nextUserId });
			});

			socket.on("conversationsRefreshRequired", () => {
				window.dispatchEvent(new Event(CONVERSATIONS_REFRESH_EVENT));
			});

			socket.on("developerBroadcast", (announcement) => {
				const normalizedAnnouncement = normalizeBroadcastAnnouncement({
					...announcement,
					isRead: false,
					receivedAt: new Date().toISOString(),
				});
				if (!normalizedAnnouncement) return;

				updateBroadcastAnnouncements((currentAnnouncements) => [
					normalizedAnnouncement,
					...currentAnnouncements.filter((currentAnnouncement) => currentAnnouncement.id !== normalizedAnnouncement.id),
				]);

				toast.custom(
					(toastRef) => (
						<div className='pointer-events-auto w-[min(92vw,24rem)] rounded-[24px] border border-cyan-300/20 bg-slate-950/94 p-4 text-slate-100 shadow-[0_20px_48px_rgba(2,6,23,0.58)]'>
							<div className='flex items-start gap-3'>
								<div className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-500/12 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100'>
									News
								</div>
								<div className='min-w-0 flex-1'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80'>
										New announcement
									</p>
									<p className='mt-1 truncate text-sm font-semibold text-white'>{normalizedAnnouncement.title}</p>
									<p className='mt-1 text-xs leading-5 text-slate-300'>
										{trimBroadcastPreview(normalizedAnnouncement.content)}
									</p>
								</div>
								<button
									type='button'
									onClick={() => toast.dismiss(toastRef.id)}
									className='inline-flex shrink-0 rounded-full border border-white/10 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white'
								>
									Close
								</button>
							</div>
						</div>
					),
					{ duration: 6000, position: "top-right" }
				);
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

			socket.on("serviceUnavailable", ({ error } = {}) => {
				showRequestErrorToast(error);
			});

			return () => {
				setIsSocketConnected(false);
				socket.off("getOnlineUsers");
				socket.off("userLastSeen");
				socket.off("deleteMessage");
				socket.off("sessionUserUpdated");
				socket.off("publicUserUpdated");
				socket.off("conversationsRefreshRequired");
				socket.off("developerBroadcast");
				socket.off("accountRemoved");
				socket.off("serviceUnavailable");
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
			setBroadcastAnnouncements([]);
		}
	}, [authUserId, setAuthUser]);

	return (
		<SocketContext.Provider
			value={{
				socket,
				isSocketConnected,
				onlineUsers,
				lastSeenByUser,
				broadcastAnnouncements,
				unreadBroadcastCount,
				markBroadcastsRead,
				dismissBroadcast,
				clearBroadcasts,
			}}
		>
			{children}
		</SocketContext.Provider>
	);
};
