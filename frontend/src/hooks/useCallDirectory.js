import { useEffect, useState } from "react";
import { useSocketContext } from "../context/SocketContext";
import { showRequestErrorToast } from "../utils/requestFeedback";

const CALLS_REFRESH_EVENT = "chat:calls-refresh";

const useCallDirectory = () => {
	const { socket } = useSocketContext();
	const [loading, setLoading] = useState(false);
	const [calls, setCalls] = useState([]);

	useEffect(() => {
		let isCancelled = false;

		const loadCalls = async () => {
			setLoading(true);
			try {
				const response = await fetch("/api/calls");
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Failed to load calls");
				}

				if (!isCancelled) {
					setCalls(Array.isArray(data) ? data : []);
				}
			} catch (error) {
				if (!isCancelled) {
					showRequestErrorToast(error.message);
				}
			} finally {
				if (!isCancelled) {
					setLoading(false);
				}
			}
		};

		void loadCalls();

		const handleRefresh = () => {
			void loadCalls();
		};

		window.addEventListener(CALLS_REFRESH_EVENT, handleRefresh);

		return () => {
			isCancelled = true;
			window.removeEventListener(CALLS_REFRESH_EVENT, handleRefresh);
		};
	}, []);

	useEffect(() => {
		if (!socket) return undefined;

		const refreshCalls = () => {
			window.dispatchEvent(new Event(CALLS_REFRESH_EVENT));
		};

		socket.on("call:ringing", refreshCalls);
		socket.on("call:participants", refreshCalls);
		socket.on("call:ended", refreshCalls);

		return () => {
			socket.off("call:ringing", refreshCalls);
			socket.off("call:participants", refreshCalls);
			socket.off("call:ended", refreshCalls);
		};
	}, [socket]);

	return { calls, loading };
};

export default useCallDirectory;
