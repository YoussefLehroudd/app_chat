import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";

const getUserId = (user) => user?._id || user?.id || null;

const sortInvitations = (invitations) =>
	[...(Array.isArray(invitations) ? invitations : [])].sort((invitationA, invitationB) => {
		const invitationATime = invitationA?.createdAt ? new Date(invitationA.createdAt).getTime() : 0;
		const invitationBTime = invitationB?.createdAt ? new Date(invitationB.createdAt).getTime() : 0;
		return invitationBTime - invitationATime;
	});

const useDirectInvitations = () => {
	const { authUser } = useAuthContext();
	const { socket } = useSocketContext();
	const authUserId = getUserId(authUser);
	const [loading, setLoading] = useState(false);
	const [invitations, setInvitations] = useState([]);
	const [sendingByUserId, setSendingByUserId] = useState({});
	const [respondingByInvitationId, setRespondingByInvitationId] = useState({});
	const requestSequenceRef = useRef(0);
	const isMountedRef = useRef(false);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const refreshInvitations = useCallback(
		async ({ silent = false } = {}) => {
			if (!authUserId || !isMountedRef.current) return [];

			const requestId = ++requestSequenceRef.current;
			if (!silent) {
				setLoading(true);
			}

			try {
				const response = await fetch("/api/conversations/direct-invitations");
				const data = await response.json().catch(() => null);
				if (!response.ok || data?.error) {
					throw new Error(data?.error || "Failed to load invitations");
				}

				if (!isMountedRef.current || requestId !== requestSequenceRef.current) {
					return [];
				}

				const normalizedInvitations = sortInvitations(Array.isArray(data) ? data : []);
				setInvitations(normalizedInvitations);
				return normalizedInvitations;
			} catch (error) {
				if (!silent && isMountedRef.current && requestId === requestSequenceRef.current) {
					toast.error(error.message);
				}
				return [];
			} finally {
				if (!silent && isMountedRef.current && requestId === requestSequenceRef.current) {
					setLoading(false);
				}
			}
		},
		[authUserId]
	);

	useEffect(() => {
		if (!authUserId) {
			setInvitations([]);
			setLoading(false);
			return;
		}

		void refreshInvitations();
	}, [authUserId, refreshInvitations]);

	useEffect(() => {
		if (!socket || !authUserId) return undefined;

		const handleInvitationsChanged = () => {
			void refreshInvitations({ silent: true });
		};

		socket.on("directInvitationsChanged", handleInvitationsChanged);
		return () => {
			socket.off("directInvitationsChanged", handleInvitationsChanged);
		};
	}, [authUserId, refreshInvitations, socket]);

	const sendInvitation = useCallback(
		async (recipientId) => {
			const normalizedRecipientId = typeof recipientId === "string" ? recipientId.trim() : "";
			if (!normalizedRecipientId) return null;

			setSendingByUserId((currentState) => ({
				...currentState,
				[normalizedRecipientId]: true,
			}));

			try {
				const response = await fetch("/api/conversations/direct-invitations", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ recipientId: normalizedRecipientId }),
				});

				const data = await response.json().catch(() => null);
				if (!response.ok || data?.error) {
					throw new Error(data?.error || "Failed to send invitation");
				}

				if (data?.autoAccepted) {
					toast.success("Invitation accepted. You can chat now.");
				} else {
					toast.success("Invitation sent");
				}

				await refreshInvitations({ silent: true });
				window.dispatchEvent(new Event("chat:conversations-refresh"));
				return data;
			} catch (error) {
				toast.error(error.message);
				return null;
			} finally {
				setSendingByUserId((currentState) => {
					const nextState = { ...currentState };
					delete nextState[normalizedRecipientId];
					return nextState;
				});
			}
		},
		[refreshInvitations]
	);

	const respondInvitation = useCallback(
		async (invitationId, action) => {
			const normalizedInvitationId = typeof invitationId === "string" ? invitationId.trim() : "";
			const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : "";
			if (!normalizedInvitationId || !["ACCEPT", "DECLINE"].includes(normalizedAction)) {
				return null;
			}

			setRespondingByInvitationId((currentState) => ({
				...currentState,
				[normalizedInvitationId]: true,
			}));

			try {
				const response = await fetch(`/api/conversations/direct-invitations/${normalizedInvitationId}/respond`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ action: normalizedAction }),
				});

				const data = await response.json().catch(() => null);
				if (!response.ok || data?.error) {
					throw new Error(data?.error || "Failed to respond to invitation");
				}

				toast.success(normalizedAction === "ACCEPT" ? "Invitation accepted" : "Invitation declined");
				await refreshInvitations({ silent: true });
				window.dispatchEvent(new Event("chat:conversations-refresh"));
				return data;
			} catch (error) {
				toast.error(error.message);
				return null;
			} finally {
				setRespondingByInvitationId((currentState) => {
					const nextState = { ...currentState };
					delete nextState[normalizedInvitationId];
					return nextState;
				});
			}
		},
		[refreshInvitations]
	);

	const incomingInvitations = useMemo(
		() => invitations.filter((invitation) => invitation?.direction === "INCOMING"),
		[invitations]
	);
	const outgoingInvitations = useMemo(
		() => invitations.filter((invitation) => invitation?.direction === "OUTGOING"),
		[invitations]
	);

	const pendingCounterpartIds = useMemo(
		() =>
			new Set(
				invitations
					.map((invitation) => invitation?.counterpart?._id)
					.filter((counterpartId) => typeof counterpartId === "string" && counterpartId)
			),
		[invitations]
	);

	const isSendingToUser = useCallback(
		(userId) => Boolean(userId && sendingByUserId[userId]),
		[sendingByUserId]
	);
	const isRespondingToInvitation = useCallback(
		(invitationId) => Boolean(invitationId && respondingByInvitationId[invitationId]),
		[respondingByInvitationId]
	);

	return {
		loading,
		invitations,
		incomingInvitations,
		outgoingInvitations,
		pendingCounterpartIds,
		refreshInvitations,
		sendInvitation,
		respondInvitation,
		isSendingToUser,
		isRespondingToInvitation,
	};
};

export default useDirectInvitations;
