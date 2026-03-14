import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
	HiOutlineArchiveBoxXMark,
	HiMagnifyingGlass,
	HiOutlineArrowLeftOnRectangle,
	HiOutlineBellSlash,
	HiOutlineCamera,
	HiOutlinePencilSquare,
	HiOutlineTrash,
	HiOutlineUserMinus,
	HiOutlineUserPlus,
} from "react-icons/hi2";
import { useAuthContext } from "../context/AuthContext";
import useModalBodyScrollLock from "../hooks/useModalBodyScrollLock";
import useConversation from "../zustand/useConversation";
import getConversationFallbackAvatar from "../utils/conversationAvatar";
import { getAvatarUrl } from "../utils/avatar";
import { matchesUserSearchQuery } from "../utils/search";
import DeveloperBadge from "./common/DeveloperBadge";
import VerifiedBadge from "./common/VerifiedBadge";

const UserInfoModal = ({ user, open, onClose }) => {
	const { authUser } = useAuthContext();
	const { setSelectedConversation, setMessages, setShowSidebar } = useConversation();
	const isGroupConversation = user?.type === "GROUP";
	const fallbackAvatar = getConversationFallbackAvatar(user);
	const resolvedProfilePic = getAvatarUrl(user?.profilePic, 256);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const [isEditMode, setIsEditMode] = useState(false);
	const [showAddMembers, setShowAddMembers] = useState(false);
	const [showInviteMembers, setShowInviteMembers] = useState(false);
	const [isSavingGroup, setIsSavingGroup] = useState(false);
	const [isLeavingGroup, setIsLeavingGroup] = useState(false);
	const [isDeletingGroup, setIsDeletingGroup] = useState(false);
	const [isJoiningGroup, setIsJoiningGroup] = useState(false);
	const [loadingSelectableUsers, setLoadingSelectableUsers] = useState(false);
	const [updatingMemberAction, setUpdatingMemberAction] = useState(null);
	const [selectableUsers, setSelectableUsers] = useState([]);
	const [memberSearchValue, setMemberSearchValue] = useState("");
	const [groupName, setGroupName] = useState("");
	const [groupDescription, setGroupDescription] = useState("");
	const [groupMemberLimit, setGroupMemberLimit] = useState("");
	const [groupPrivate, setGroupPrivate] = useState(false);
	const [groupImageFile, setGroupImageFile] = useState(null);
	const [groupWorkspace, setGroupWorkspace] = useState(null);
	const [isGroupWorkspaceLoading, setIsGroupWorkspaceLoading] = useState(false);
	const [groupWorkspaceAction, setGroupWorkspaceAction] = useState("");
	const [newRule, setNewRule] = useState("");
	const [newAnnouncement, setNewAnnouncement] = useState("");
	const [inviteLinkDays, setInviteLinkDays] = useState("7");
	const [eventDraft, setEventDraft] = useState({
		title: "",
		description: "",
		location: "",
		startsAt: "",
	});
	const [pollDraft, setPollDraft] = useState({
		question: "",
		options: ["", ""],
		allowsMultiple: false,
		closesAt: "",
	});
	const [isBlockedUser, setIsBlockedUser] = useState(false);
	const [isDirectActionLoading, setIsDirectActionLoading] = useState(false);
	const [toolSearchQuery, setToolSearchQuery] = useState("");
	const [toolSearchMode, setToolSearchMode] = useState("all");
	const [toolSearchResults, setToolSearchResults] = useState([]);
	const [pinnedItems, setPinnedItems] = useState([]);
	const [galleryItems, setGalleryItems] = useState([]);
	const [savedItems, setSavedItems] = useState([]);
	const [toolLoadingState, setToolLoadingState] = useState("");
	const [toolPanelState, setToolPanelState] = useState({
		searched: false,
		pinsLoaded: false,
		galleryLoaded: false,
		savedLoaded: false,
	});
	const imgRef = useRef(null);
	const fileInputRef = useRef(null);
	const previewUrlRef = useRef(null);
	useModalBodyScrollLock(open);

	const currentGroupMember = useMemo(
		() => user?.members?.find((member) => member._id === authUser?._id) || null,
		[user?.members, authUser?._id]
	);
	const isGroupMember = isGroupConversation && Boolean(currentGroupMember);
	const isGroupOwner = isGroupConversation && currentGroupMember?.memberRole === "OWNER";
	const isGroupAdmin = isGroupConversation && currentGroupMember?.memberRole === "ADMIN";
	const isGroupModerator = isGroupConversation && currentGroupMember?.memberRole === "MODERATOR";
	const canManageGroup = isGroupOwner || isGroupAdmin;
	const canModerateGroup = isGroupOwner || isGroupAdmin || isGroupModerator;
	const canInviteToGroup = isGroupMember;
	const currentMemberCount = user?.memberCount || user?.members?.length || 0;
	const limitReached = Boolean(user?.memberLimit && currentMemberCount >= user.memberLimit);
	const mustTransferOwnershipBeforeLeaving = isGroupOwner && currentMemberCount > 1;
	const hasPendingMemberAction = Boolean(updatingMemberAction);
	const isMemberActionPending = (action, memberId) => updatingMemberAction === `${action}:${memberId}`;
	const conversationPreferenceId = user?.conversationId || user?._id || "";
	const isConversationMuted = Boolean(user?.mutedUntil && new Date(user.mutedUntil).getTime() > Date.now());
	const canManageDisappearingMessages = !isGroupConversation || canManageGroup;

	const filteredSelectableUsers = useMemo(() => {
		if (!isGroupConversation) return [];

		const existingMemberIds = new Set((user?.members || []).map((member) => member._id));

		return selectableUsers.filter((member) => {
			if (existingMemberIds.has(member._id)) return false;
			return matchesUserSearchQuery(memberSearchValue, [member.fullName, member.username, member.bio]);
		});
	}, [isGroupConversation, memberSearchValue, selectableUsers, user?.members]);

	const getRoleActionOptions = (memberRole) => {
		switch (memberRole) {
			case "ADMIN":
				return [
					{
						label: "Make moderator",
						role: "MODERATOR",
						className:
							"rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-500/16 disabled:cursor-not-allowed disabled:opacity-60",
					},
					{
						label: "Make member",
						role: "MEMBER",
						className:
							"rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-300/35 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60",
					},
				];
			case "MODERATOR":
				return [
					{
						label: "Make admin",
						role: "ADMIN",
						className:
							"rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-60",
					},
					{
						label: "Make member",
						role: "MEMBER",
						className:
							"rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-300/35 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60",
					},
				];
			case "MEMBER":
			default:
				return [
					{
						label: "Make moderator",
						role: "MODERATOR",
						className:
							"rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-500/16 disabled:cursor-not-allowed disabled:opacity-60",
					},
					{
						label: "Make admin",
						role: "ADMIN",
						className:
							"rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-60",
					},
				];
		}
	};

	const applyConversationUpdate = (conversation) => {
		if (!conversation?._id) return;
		setSelectedConversation(conversation);
		window.dispatchEvent(
			new CustomEvent("chat:conversation-restored", {
				detail: { conversation },
			})
		);
	};

	const removeConversationLocally = (conversationId) => {
		setSelectedConversation(null);
		setMessages([]);
		setShowSidebar(true);
		window.dispatchEvent(
			new CustomEvent("chat:conversation-removed", {
				detail: { conversationId },
			})
		);
	};

	useEffect(() => {
		if (!open) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	useEffect(() => {
		setAvatarSrc(resolvedProfilePic || fallbackAvatar);
		setAvatarLoaded(!resolvedProfilePic);
	}, [resolvedProfilePic, fallbackAvatar]);

	useEffect(() => {
		const img = imgRef.current;
		if (!img) return;
		if (img.complete && img.naturalWidth > 0) {
			setAvatarLoaded(true);
		}
	}, [avatarSrc]);

	useEffect(() => {
		if (previewUrlRef.current) {
			URL.revokeObjectURL(previewUrlRef.current);
			previewUrlRef.current = null;
		}

		setGroupName(user?.fullName || "");
		setGroupDescription(user?.bio || "");
		setGroupMemberLimit(user?.memberLimit ? String(user.memberLimit) : "");
		setGroupPrivate(Boolean(user?.isPrivate));
		setGroupImageFile(null);
		setGroupWorkspace(null);
		setGroupWorkspaceAction("");
		setNewRule("");
		setNewAnnouncement("");
		setInviteLinkDays("7");
		setEventDraft({
			title: "",
			description: "",
			location: "",
			startsAt: "",
		});
		setPollDraft({
			question: "",
			options: ["", ""],
			allowsMultiple: false,
			closesAt: "",
		});
		setIsEditMode(false);
		setShowAddMembers(false);
		setShowInviteMembers(false);
		setMemberSearchValue("");
		setIsBlockedUser(false);
		setToolSearchQuery("");
		setToolSearchMode("all");
		setToolSearchResults([]);
		setPinnedItems([]);
		setGalleryItems([]);
		setSavedItems([]);
		setToolLoadingState("");
		setToolPanelState({
			searched: false,
			pinsLoaded: false,
			galleryLoaded: false,
			savedLoaded: false,
		});
	}, [user?._id, user?.fullName, user?.bio, user?.memberLimit, user?.isPrivate]);

	useEffect(() => {
		if (!open || isGroupConversation || !user?._id) {
			return undefined;
		}

		let isCancelled = false;

		const loadBlockedUsers = async () => {
			try {
				const response = await fetch("/api/users/blocked");
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Failed to load blocked users");
				}

				if (!isCancelled) {
					const blockedUsers = Array.isArray(data.blockedUsers) ? data.blockedUsers : [];
					setIsBlockedUser(blockedUsers.some((blockedUser) => blockedUser._id === user._id));
				}
			} catch {
				if (!isCancelled) {
					setIsBlockedUser(false);
				}
			}
		};

		loadBlockedUsers();

		return () => {
			isCancelled = true;
		};
	}, [open, isGroupConversation, user?._id]);

	useEffect(() => {
		if (!open || !isGroupConversation || !user?._id || !isGroupMember) {
			return undefined;
		}

		let isCancelled = false;

		const loadGroupWorkspace = async () => {
			setIsGroupWorkspaceLoading(true);
			try {
				const response = await fetch(`/api/conversations/groups/${user._id}/workspace`);
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data.error || "Failed to load group workspace");
				}

				if (!isCancelled) {
					setGroupWorkspace(data);
				}
			} catch (error) {
				if (!isCancelled) {
					toast.error(error.message);
				}
			} finally {
				if (!isCancelled) {
					setIsGroupWorkspaceLoading(false);
				}
			}
		};

		loadGroupWorkspace();

		return () => {
			isCancelled = true;
		};
	}, [open, isGroupConversation, isGroupMember, user?._id]);

	useEffect(() => {
		setToolSearchResults([]);
		setToolPanelState((currentState) => ({
			...currentState,
			searched: false,
		}));
	}, [toolSearchMode]);

	useEffect(() => {
		if (
			!open ||
			!isGroupConversation ||
			((!canManageGroup || !showAddMembers) && (!canInviteToGroup || !showInviteMembers))
		) {
			return undefined;
		}

		let isCancelled = false;

		const loadSelectableUsers = async () => {
			setLoadingSelectableUsers(true);
			try {
				const response = await fetch("/api/users/selectable?scope=contacts");
				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || "Failed to load users");
				}

				if (!isCancelled) {
					setSelectableUsers(Array.isArray(data) ? data : []);
				}
			} catch (error) {
				if (!isCancelled) {
					toast.error(error.message);
				}
			} finally {
				if (!isCancelled) {
					setLoadingSelectableUsers(false);
				}
			}
		};

		loadSelectableUsers();

		return () => {
			isCancelled = true;
		};
	}, [open, isGroupConversation, canManageGroup, showAddMembers, canInviteToGroup, showInviteMembers]);

	useEffect(() => {
		return () => {
			if (previewUrlRef.current) {
				URL.revokeObjectURL(previewUrlRef.current);
			}
		};
	}, []);

	if (!open || !user) return null;

	const handleGroupImageChange = (event) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (previewUrlRef.current) {
			URL.revokeObjectURL(previewUrlRef.current);
		}

		const nextPreviewUrl = URL.createObjectURL(file);
		previewUrlRef.current = nextPreviewUrl;
		setGroupImageFile(file);
		setAvatarSrc(nextPreviewUrl);
		setAvatarLoaded(true);
	};

	const handleSaveGroup = async (event) => {
		event.preventDefault();
		if (!isGroupConversation || !canManageGroup || isSavingGroup) return;

		if (!groupName.trim()) {
			toast.error("Group name is required");
			return;
		}

		setIsSavingGroup(true);
		try {
			const formData = new FormData();
			formData.append("title", groupName.trim());
			formData.append("description", groupDescription.trim());
			formData.append("memberLimit", groupMemberLimit.trim());
			formData.append("isPrivate", String(groupPrivate));
			if (groupImageFile) {
				formData.append("profilePic", groupImageFile);
			}

			const response = await fetch(`/api/conversations/groups/${user._id}`, {
				method: "PATCH",
				body: formData,
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update group");
			}

			applyConversationUpdate(data);
			setIsEditMode(false);
			toast.success("Group updated");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsSavingGroup(false);
		}
	};

	const handleAddMember = async (memberId) => {
		if (!isGroupConversation || !canManageGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`add:${memberId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/members`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ memberIds: [memberId] }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to add member");
			}

			applyConversationUpdate(data);
			toast.success("Member added");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleRemoveMember = async (memberId) => {
		if (!isGroupConversation || !canManageGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`remove:${memberId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/members/${memberId}`, {
				method: "DELETE",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to remove member");
			}

			applyConversationUpdate(data);
			toast.success("Member removed");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleUpdateMemberRole = async (memberId, role) => {
		if (!isGroupConversation || !canManageGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`role:${memberId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/members/${memberId}/role`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ role }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update role");
			}

			applyConversationUpdate(data);
			const roleSuccessMessage =
				role === "OWNER"
					? "Ownership transferred"
					: role === "ADMIN"
						? "Member promoted to admin"
						: role === "MODERATOR"
							? "Member promoted to moderator"
							: "Member changed to standard access";
			toast.success(roleSuccessMessage);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleSendInvite = async (recipientId) => {
		if (!isGroupConversation || !canInviteToGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`invite:${recipientId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/invitations`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ recipientId }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to send invitation");
			}

			toast.success("Invitation sent");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleJoinPublicGroup = async () => {
		if (!isGroupConversation || isGroupMember || user?.isPrivate || isJoiningGroup) return;

		setIsJoiningGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/join`, {
				method: "POST",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to join group");
			}

			applyConversationUpdate(data);
			toast.success("You joined the group");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsJoiningGroup(false);
		}
	};

	const handleLeaveGroup = async () => {
		if (!isGroupConversation || !isGroupMember || isLeavingGroup) return;

		setIsLeavingGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/leave`, {
				method: "POST",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to leave group");
			}

			removeConversationLocally(user._id);
			onClose();
			toast.success("You left the group");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsLeavingGroup(false);
		}
	};

	const handleDeleteGroup = async () => {
		if (!isGroupOwner || isDeletingGroup) return;

		const shouldDelete = window.confirm("Delete this group for everyone? This action cannot be undone.");
		if (!shouldDelete) return;

		setIsDeletingGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}`, {
				method: "DELETE",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete group");
			}

			removeConversationLocally(user._id);
			onClose();
			toast.success("Group deleted");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsDeletingGroup(false);
		}
	};

	const handleDirectPreferenceUpdate = async (payload, successMessage) => {
		if (!conversationPreferenceId || isDirectActionLoading) return;

		setIsDirectActionLoading(true);
		try {
			const response = await fetch(`/api/conversations/${conversationPreferenceId}/preferences`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update conversation");
			}

			applyConversationUpdate(data);
			if (successMessage) {
				toast.success(successMessage);
			}
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsDirectActionLoading(false);
		}
	};

	const handleDisappearingUpdate = async (seconds) => {
		if (!conversationPreferenceId || isDirectActionLoading || !canManageDisappearingMessages) return;

		setIsDirectActionLoading(true);
		try {
			const response = await fetch(`/api/conversations/${conversationPreferenceId}/disappearing`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ seconds }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update disappearing messages");
			}

			applyConversationUpdate(data);
			toast.success(seconds ? "Disappearing messages updated" : "Disappearing messages disabled");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsDirectActionLoading(false);
		}
	};

	const handleToggleBlockUser = async () => {
		if (isGroupConversation || !user?._id || isDirectActionLoading) return;

		setIsDirectActionLoading(true);
		try {
			const response = await fetch(`/api/users/block/${user._id}`, {
				method: isBlockedUser ? "DELETE" : "POST",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update block state");
			}

			setIsBlockedUser(!isBlockedUser);
			toast.success(isBlockedUser ? "User unblocked" : "User blocked");
			window.dispatchEvent(new Event("chat:conversations-refresh"));
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsDirectActionLoading(false);
		}
	};

	const dispatchJumpToMessage = (messageId) => {
		if (!messageId) return;
		window.dispatchEvent(
			new CustomEvent("chat:jump-to-message", {
				detail: { messageId },
			})
		);
		onClose();
	};

	const handleSearchConversation = async () => {
		const trimmedQuery = toolSearchQuery.trim();
		if ((!trimmedQuery && toolSearchMode === "all") || !user?._id) return;

		setToolLoadingState("search");
		try {
			const endpoint = isGroupConversation
				? `/api/messages/search/group/${user._id}?q=${encodeURIComponent(trimmedQuery)}&mode=${encodeURIComponent(toolSearchMode)}`
				: `/api/messages/search/${user._id}?q=${encodeURIComponent(trimmedQuery)}&mode=${encodeURIComponent(toolSearchMode)}`;
			const response = await fetch(endpoint);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to search messages");
			}
			setToolSearchResults(Array.isArray(data.results) ? data.results : []);
			setToolPanelState((currentState) => ({
				...currentState,
				searched: true,
			}));
		} catch (error) {
			toast.error(error.message);
		} finally {
			setToolLoadingState("");
		}
	};

	const handleLoadPinnedMessages = async () => {
		const conversationId = user?.conversationId || user?._id;
		if (!conversationId) return;

		setToolLoadingState("pins");
		try {
			const response = await fetch(`/api/messages/pins/${conversationId}`);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to load pinned messages");
			}
			setPinnedItems(Array.isArray(data.items) ? data.items : []);
			setToolPanelState((currentState) => ({
				...currentState,
				pinsLoaded: true,
			}));
		} catch (error) {
			toast.error(error.message);
		} finally {
			setToolLoadingState("");
		}
	};

	const handleLoadGallery = async () => {
		if (!user?._id) return;

		setToolLoadingState("gallery");
		try {
			const endpoint = isGroupConversation
				? `/api/messages/gallery/group/${user._id}`
				: `/api/messages/gallery/${user._id}`;
			const response = await fetch(endpoint);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to load gallery");
			}
			setGalleryItems(Array.isArray(data.items) ? data.items : []);
			setToolPanelState((currentState) => ({
				...currentState,
				galleryLoaded: true,
			}));
		} catch (error) {
			toast.error(error.message);
		} finally {
			setToolLoadingState("");
		}
	};

	const handleLoadSavedMessages = async () => {
		const conversationId = user?.conversationId || user?._id;
		setToolLoadingState("saved");
		try {
			const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
			const response = await fetch(`/api/messages/saved${query}`);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to load saved messages");
			}
			setSavedItems(Array.isArray(data.items) ? data.items : []);
			setToolPanelState((currentState) => ({
				...currentState,
				savedLoaded: true,
			}));
		} catch (error) {
			toast.error(error.message);
		} finally {
			setToolLoadingState("");
		}
	};

	const runGroupWorkspaceAction = async ({
		endpoint,
		method = "POST",
		body,
		successMessage = "",
		afterSuccess,
	}) => {
		if (!isGroupConversation || !user?._id || groupWorkspaceAction) return;

		setGroupWorkspaceAction(endpoint);
		try {
			const response = await fetch(endpoint, {
				method,
				headers: {
					"Content-Type": "application/json",
				},
				...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
			});
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Failed to update group workspace");
			}

			setGroupWorkspace(data);
			if (successMessage) {
				toast.success(successMessage);
			}
			if (typeof afterSuccess === "function") {
				afterSuccess();
			}
			window.dispatchEvent(new Event("chat:conversations-refresh"));
			return data;
		} catch (error) {
			toast.error(error.message);
			return null;
		} finally {
			setGroupWorkspaceAction("");
		}
	};

	const handleUpdateGroupWorkspaceSettings = async (payload, successMessage) =>
		runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/workspace/settings`,
			method: "PATCH",
			body: payload,
			successMessage,
		});

	const handleAddPinnedRule = async () => {
		const nextRule = newRule.trim();
		if (!nextRule || !groupWorkspace) return;

		const nextRules = [...(groupWorkspace.group?.pinnedRules || []), nextRule];
		const result = await handleUpdateGroupWorkspaceSettings(
			{ pinnedRules: nextRules },
			"Rules updated"
		);
		if (result) {
			setNewRule("");
		}
	};

	const handleRemovePinnedRule = async (ruleIndex) => {
		if (!groupWorkspace) return;
		const nextRules = (groupWorkspace.group?.pinnedRules || []).filter((_, index) => index !== ruleIndex);
		await handleUpdateGroupWorkspaceSettings({ pinnedRules: nextRules }, "Rules updated");
	};

	const handleUpdateSlowMode = async (seconds) => {
		await handleUpdateGroupWorkspaceSettings(
			{ slowModeSeconds: seconds },
			seconds ? "Slow mode updated" : "Slow mode disabled"
		);
	};

	const handleCreateAnnouncement = async () => {
		const content = newAnnouncement.trim();
		if (!content) return;

		const result = await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/announcements`,
			body: { content },
			successMessage: "Announcement posted",
		});

		if (result) {
			setNewAnnouncement("");
		}
	};

	const handleCreateEvent = async () => {
		if (!eventDraft.title.trim() || !eventDraft.startsAt) {
			toast.error("Event title and date are required");
			return;
		}

		const result = await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/events`,
			body: {
				title: eventDraft.title.trim(),
				description: eventDraft.description.trim(),
				location: eventDraft.location.trim(),
				startsAt: eventDraft.startsAt,
			},
			successMessage: "Event created",
		});

		if (result) {
			setEventDraft({
				title: "",
				description: "",
				location: "",
				startsAt: "",
			});
		}
	};

	const handlePollOptionChange = (index, value) => {
		setPollDraft((currentDraft) => ({
			...currentDraft,
			options: currentDraft.options.map((option, optionIndex) =>
				optionIndex === index ? value : option
			),
		}));
	};

	const handleAddPollOption = () => {
		setPollDraft((currentDraft) => ({
			...currentDraft,
			options: [...currentDraft.options, ""].slice(0, 8),
		}));
	};

	const handleCreatePoll = async () => {
		const normalizedOptions = pollDraft.options.map((option) => option.trim()).filter(Boolean);
		if (!pollDraft.question.trim() || normalizedOptions.length < 2) {
			toast.error("Poll question and two options are required");
			return;
		}

		const result = await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/polls`,
			body: {
				question: pollDraft.question.trim(),
				options: normalizedOptions,
				allowsMultiple: pollDraft.allowsMultiple,
				closesAt: pollDraft.closesAt || null,
			},
			successMessage: "Poll created",
		});

		if (result) {
			setPollDraft({
				question: "",
				options: ["", ""],
				allowsMultiple: false,
				closesAt: "",
			});
		}
	};

	const handleVotePoll = async (pollId, optionId) => {
		await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/polls/${pollId}/votes`,
			body: { optionId },
		});
	};

	const handleCreateInviteLink = async () => {
		await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/invite-links`,
			body: { expiresInDays: Number(inviteLinkDays) || 7 },
			successMessage: "Invite link created",
		});
	};

	const handleCopyInviteLink = async (code) => {
		if (!code) return;
		const inviteUrl = `${window.location.origin}/?groupInvite=${code}`;

		try {
			await navigator.clipboard.writeText(inviteUrl);
			toast.success("Invite link copied");
		} catch {
			toast.error("Unable to copy invite link");
		}
	};

	const handleRevokeInviteLink = async (linkId) => {
		await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/invite-links/${linkId}`,
			method: "DELETE",
			successMessage: "Invite link revoked",
		});
	};

	const handleRespondJoinRequest = async (requestId, action) => {
		await runGroupWorkspaceAction({
			endpoint: `/api/conversations/groups/${user._id}/join-requests/${requestId}/respond`,
			body: { action },
			successMessage: action === "APPROVE" ? "Join request approved" : "Join request declined",
		});
	};

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 sm:p-5'
			onClick={onClose}
		>
			<div
				className='flex h-[min(90vh,860px)] w-full max-w-xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(10,18,36,0.96))] text-white shadow-[0_32px_80px_rgba(2,6,23,0.55)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='shrink-0 border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6'>
					<div className='flex items-start justify-between gap-4'>
							<div
								className='min-w-0'
								data-copy-user={!isGroupConversation ? user?.username : undefined}
								title={!isGroupConversation ? "Click to copy username" : undefined}
							>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/80'>User Info</p>
							<div className='mt-2 flex flex-wrap items-center gap-2'>
								<h2 className='text-2xl font-bold text-slate-50 sm:text-[2rem]'>{user.fullName}</h2>
								{isGroupConversation ? (
									<span className='rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100'>
										{user.isPrivate ? "Private group" : "Group chat"}
									</span>
								) : (
									<>
										<VerifiedBadge user={user} />
										<DeveloperBadge user={user} />
									</>
								)}
							</div>
						</div>
						<button
							type='button'
							className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
							onClick={onClose}
						>
							Close
						</button>
					</div>
				</div>

				<div className='custom-scrollbar modal-scroll-region min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6'>
					<div className='space-y-4'>
						<div className='flex justify-center'>
							<div className='relative h-28 w-28 overflow-hidden rounded-full border-4 border-sky-400/30 bg-slate-800 shadow-[0_20px_40px_rgba(14,165,233,0.14)]'>
								<div
									className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
										avatarLoaded ? "opacity-0" : "opacity-100"
									}`}
								></div>
								<img
									ref={imgRef}
									src={avatarSrc}
									alt={`${user.fullName} avatar`}
									className={`h-full w-full object-cover transition-opacity duration-200 ${
										avatarLoaded ? "opacity-100" : "opacity-0"
									}`}
									loading='lazy'
									decoding='async'
									fetchpriority='low'
									onLoad={() => setAvatarLoaded(true)}
									onError={() => {
										setAvatarSrc(fallbackAvatar);
										setAvatarLoaded(true);
									}}
								/>
							</div>
						</div>

						{isGroupConversation ? (
							<>
								<div className='grid gap-3 sm:grid-cols-2'>
									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Access</p>
										<p className='mt-1 text-base font-medium text-slate-100'>
											{user.isPrivate ? "Private group" : "Public group"}
										</p>
									</div>

									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Members</p>
										<p className='mt-1 text-base font-medium text-slate-100'>
											{currentMemberCount}
											{user.memberLimit ? ` / ${user.memberLimit} max` : ""}
										</p>
									</div>
								</div>

								<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
									<div className='flex flex-wrap gap-2'>
										{canManageGroup ? (
											<>
												<button
													type='button'
													onClick={() => setIsEditMode((currentValue) => !currentValue)}
													className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16'
												>
													<HiOutlinePencilSquare className='h-4 w-4' />
													{isEditMode ? "Close edit" : "Edit group"}
												</button>
												<button
													type='button'
													onClick={() => setShowAddMembers((currentValue) => !currentValue)}
													className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
													disabled={limitReached}
												>
													<HiOutlineUserPlus className='h-4 w-4' />
													{showAddMembers ? "Hide add" : "Add members"}
												</button>
											</>
										) : null}
										{canInviteToGroup ? (
											<button
												type='button'
												onClick={() => setShowInviteMembers((currentValue) => !currentValue)}
												className='inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/16'
											>
												<HiOutlineUserPlus className='h-4 w-4' />
												{showInviteMembers ? "Hide invites" : "Invite users"}
											</button>
										) : null}
										{isGroupOwner ? (
											<button
												type='button'
												onClick={handleDeleteGroup}
												className='inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
												disabled={isDeletingGroup}
											>
												<HiOutlineTrash className='h-4 w-4' />
												{isDeletingGroup ? "Deleting..." : "Delete group"}
											</button>
										) : null}
										{isGroupMember ? (
											<button
												type='button'
												onClick={handleLeaveGroup}
												className='inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
												disabled={isLeavingGroup || mustTransferOwnershipBeforeLeaving}
											>
												<HiOutlineArrowLeftOnRectangle className='h-4 w-4' />
												{isLeavingGroup
													? "Leaving..."
													: mustTransferOwnershipBeforeLeaving
														? "Transfer owner first"
														: "Leave group"}
											</button>
										) : !user?.isPrivate ? (
											<button
												type='button'
												onClick={handleJoinPublicGroup}
												className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
												disabled={isJoiningGroup}
											>
												<HiOutlineUserPlus className='h-4 w-4' />
												{isJoiningGroup ? "Joining..." : "Join group"}
											</button>
										) : null}
									</div>
									{limitReached ? (
										<p className='mt-3 text-xs text-amber-200/85'>The member limit is already reached for this group.</p>
									) : null}
									{mustTransferOwnershipBeforeLeaving ? (
										<p className='mt-3 text-xs text-amber-200/85'>
											Transfer ownership to another member before leaving this group.
										</p>
									) : null}
								</div>

								{canManageGroup && isEditMode ? (
									<form className='space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4' onSubmit={handleSaveGroup}>
										<div className='grid gap-4 sm:grid-cols-2'>
											<label className='block'>
												<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Group name</span>
												<input
													type='text'
													value={groupName}
													onChange={(event) => setGroupName(event.target.value)}
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</label>
											<label className='block'>
												<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Member limit</span>
												<input
													type='number'
													min='2'
													value={groupMemberLimit}
													onChange={(event) => setGroupMemberLimit(event.target.value)}
													placeholder='Optional'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</label>
										</div>

										<label className='block'>
											<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Description</span>
											<textarea
												rows='3'
												value={groupDescription}
												onChange={(event) => setGroupDescription(event.target.value)}
												className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
											/>
										</label>

										<div className='grid gap-4 sm:grid-cols-[1fr_auto]'>
											<label className='flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3.5'>
												<div>
													<p className='text-sm font-medium text-slate-100'>Private group</p>
													<p className='mt-1 text-xs leading-5 text-slate-400'>Toggle between private and public.</p>
												</div>
												<input
													type='checkbox'
													checked={groupPrivate}
													onChange={(event) => setGroupPrivate(event.target.checked)}
													className='toggle toggle-info shrink-0'
												/>
											</label>

											<div className='flex items-end'>
												<input
													ref={fileInputRef}
													type='file'
													accept='image/*'
													onChange={handleGroupImageChange}
													className='hidden'
												/>
												<button
													type='button'
													onClick={() => fileInputRef.current?.click()}
													className='inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]'
												>
													<HiOutlineCamera className='h-4 w-4' />
													{groupImageFile ? "Change photo" : "Upload photo"}
												</button>
											</div>
										</div>

										<div className='flex flex-col gap-3 sm:flex-row sm:justify-end'>
											<button
												type='button'
												onClick={() => setIsEditMode(false)}
												className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
											>
												Cancel
											</button>
											<button
												type='submit'
												className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
												disabled={isSavingGroup}
											>
												{isSavingGroup ? "Saving..." : "Save changes"}
											</button>
										</div>
									</form>
								) : null}

								{canManageGroup && showAddMembers ? (
									<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
										<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Add members</p>
												<p className='mt-1 text-sm text-slate-300'>Invite more people into this group.</p>
											</div>
											<div className='relative w-full sm:max-w-xs'>
												<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
												<input
													type='text'
													value={memberSearchValue}
													onChange={(event) => setMemberSearchValue(event.target.value)}
													placeholder='Search users'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</div>
										</div>

										<div className='mt-4 space-y-2'>
											{loadingSelectableUsers ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													Loading users...
												</div>
											) : filteredSelectableUsers.length === 0 ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													No available users to add.
												</div>
											) : (
												filteredSelectableUsers.map((member) => {
													const memberAvatar = getAvatarUrl(member.profilePic, 72) || getConversationFallbackAvatar(member);

													return (
														<div
															key={member._id}
															className='flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] px-3 py-3'
														>
															<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
																<img src={memberAvatar} alt={member.fullName} className='h-full w-full object-cover' />
															</div>
																<div
																	className='min-w-0 flex-1'
																	data-copy-user={member.username || undefined}
																	title={member.username ? "Click to copy username" : undefined}
																>
																	<p className='truncate text-sm font-medium text-slate-100'>{member.fullName}</p>
																	<p className='truncate text-xs text-slate-400'>@{member.username}</p>
																</div>
															<button
																type='button'
																onClick={() => handleAddMember(member._id)}
																className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																disabled={isMemberActionPending("add", member._id) || limitReached || hasPendingMemberAction}
															>
																<HiOutlineUserPlus className='h-4 w-4' />
																{isMemberActionPending("add", member._id) ? "Adding..." : "Add"}
															</button>
														</div>
													);
												})
											)}
										</div>
									</div>
								) : null}

								{canInviteToGroup && showInviteMembers ? (
									<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
										<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Invite users</p>
												<p className='mt-1 text-sm text-slate-300'>
													Send a join invitation. The user can accept or decline before entering the group.
												</p>
											</div>
											<div className='relative w-full sm:max-w-xs'>
												<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
												<input
													type='text'
													value={memberSearchValue}
													onChange={(event) => setMemberSearchValue(event.target.value)}
													placeholder='Search users'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</div>
										</div>

										<div className='mt-4 space-y-2'>
											{loadingSelectableUsers ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													Loading users...
												</div>
											) : filteredSelectableUsers.length === 0 ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													No available users to invite.
												</div>
											) : (
												filteredSelectableUsers.map((member) => {
													const memberAvatar = getAvatarUrl(member.profilePic, 72) || getConversationFallbackAvatar(member);

													return (
														<div
															key={`invite-${member._id}`}
															className='flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] px-3 py-3'
														>
															<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
																<img src={memberAvatar} alt={member.fullName} className='h-full w-full object-cover' />
															</div>
																<div
																	className='min-w-0 flex-1'
																	data-copy-user={member.username || undefined}
																	title={member.username ? "Click to copy username" : undefined}
																>
																	<p className='truncate text-sm font-medium text-slate-100'>{member.fullName}</p>
																	<p className='truncate text-xs text-slate-400'>@{member.username}</p>
																</div>
															<button
																type='button'
																onClick={() => handleSendInvite(member._id)}
																className='inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																disabled={hasPendingMemberAction}
															>
																<HiOutlineUserPlus className='h-4 w-4' />
																{isMemberActionPending("invite", member._id) ? "Sending..." : "Invite"}
															</button>
														</div>
													);
												})
											)}
										</div>
									</div>
								) : null}

								<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Conversation controls</p>
									<div className='mt-3 flex flex-wrap gap-2'>
										<button
											type='button'
											onClick={() =>
												handleDirectPreferenceUpdate(
													{ isArchived: !Boolean(user?.isArchived) },
													user?.isArchived ? "Conversation restored" : "Conversation archived"
												)
											}
											className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
											disabled={isDirectActionLoading}
										>
											{user?.isArchived ? <HiOutlineArrowLeftOnRectangle className='h-4 w-4' /> : <HiOutlineArchiveBoxXMark className='h-4 w-4' />}
											{user?.isArchived ? "Unarchive" : "Archive"}
										</button>
										<button
											type='button'
											onClick={() =>
												handleDirectPreferenceUpdate(
													{ mutedForSeconds: isConversationMuted ? 0 : 3600 },
													isConversationMuted ? "Conversation unmuted" : "Muted for 1 hour"
												)
											}
											className='inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-300/35 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60'
											disabled={isDirectActionLoading}
										>
											<HiOutlineBellSlash className='h-4 w-4' />
											{isConversationMuted ? "Unmute" : "Mute 1h"}
										</button>
									</div>

									<div className='mt-4 rounded-[20px] border border-white/10 bg-slate-950/25 p-3'>
										<div className='flex items-center justify-between gap-3'>
											<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400'>Disappearing messages</p>
											{!canManageDisappearingMessages ? (
												<span className='text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500'>Admins only</span>
											) : null}
										</div>
										<div className='mt-3 flex flex-wrap gap-2'>
											{[
												{ label: "Off", value: null },
												{ label: "5m", value: 300 },
												{ label: "1h", value: 3600 },
												{ label: "1d", value: 86400 },
												{ label: "7d", value: 604800 },
											].map((option) => {
												const isActive = (user?.disappearingMessagesSeconds || null) === option.value;
												return (
													<button
														key={option.label}
														type='button'
														onClick={() => handleDisappearingUpdate(option.value)}
														className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
															isActive
																? "border-sky-300/35 bg-sky-500/16 text-sky-50"
																: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]"
														}`}
														disabled={isDirectActionLoading || !canManageDisappearingMessages}
													>
														{option.label}
													</button>
												);
											})}
										</div>
									</div>
								</div>

								{isGroupMember ? (
									isGroupWorkspaceLoading && !groupWorkspace ? (
										<div className='rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-slate-400'>
											Loading group workspace...
										</div>
									) : groupWorkspace ? (
										<>
											<div className='grid gap-4 lg:grid-cols-2'>
												<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
													<div className='flex items-center justify-between gap-3'>
														<div>
															<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Pinned rules</p>
															<p className='mt-1 text-sm text-slate-300'>Set expectations and pace for this group.</p>
														</div>
														<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200'>
															{currentGroupMember?.memberRole || "Member"}
														</span>
													</div>

													<div className='mt-4 flex flex-wrap gap-2'>
														{[
															{ label: "Off", value: null },
															{ label: "15s", value: 15 },
															{ label: "30s", value: 30 },
															{ label: "1m", value: 60 },
															{ label: "5m", value: 300 },
														].map((option) => {
															const isActive = (groupWorkspace.group?.slowModeSeconds || null) === option.value;
															return (
																<button
																	key={option.label}
																	type='button'
																	onClick={() => handleUpdateSlowMode(option.value)}
																	className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
																		isActive
																			? "border-sky-300/35 bg-sky-500/16 text-sky-50"
																			: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]"
																	}`}
																	disabled={!canModerateGroup || Boolean(groupWorkspaceAction)}
																>
																	{option.label}
																</button>
															);
														})}
													</div>

													<div className='mt-4 space-y-2'>
														{(groupWorkspace.group?.pinnedRules || []).length ? (
															groupWorkspace.group.pinnedRules.map((rule, index) => (
																<div
																	key={`${rule}-${index}`}
																	className='flex items-start justify-between gap-3 rounded-[18px] border border-white/10 bg-slate-950/30 px-3 py-3'
																>
																	<p className='text-sm leading-6 text-slate-100'>{rule}</p>
																	{canModerateGroup ? (
																		<button
																			type='button'
																			onClick={() => handleRemovePinnedRule(index)}
																			className='rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100'
																			disabled={Boolean(groupWorkspaceAction)}
																		>
																			Remove
																		</button>
																	) : null}
																</div>
															))
														) : (
															<div className='rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-4 text-sm text-slate-400'>
																No pinned rules yet.
															</div>
														)}
													</div>

													{canModerateGroup ? (
														<div className='mt-4 flex gap-2'>
															<input
																type='text'
																value={newRule}
																onChange={(event) => setNewRule(event.target.value)}
																placeholder='Add a pinned rule'
																className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															<button
																type='button'
																onClick={handleAddPinnedRule}
																className='rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100'
																disabled={!newRule.trim() || Boolean(groupWorkspaceAction)}
															>
																Add
															</button>
														</div>
													) : null}
												</div>

												<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
													<div className='flex items-center justify-between gap-3'>
														<div>
															<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Member activity</p>
															<p className='mt-1 text-sm text-slate-300'>Latest interaction and most active people.</p>
														</div>
														<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200'>
															Top {Math.min(5, groupWorkspace.memberActivity?.length || 0)}
														</span>
													</div>

													<div className='mt-4 space-y-2'>
														{(groupWorkspace.memberActivity || []).slice(0, 5).map((entry) => (
															<div key={entry.user?._id} className='rounded-[18px] border border-white/10 bg-slate-950/30 px-3 py-3'>
																<div className='flex items-center justify-between gap-3'>
																	<div className='min-w-0'>
																		<p className='truncate text-sm font-semibold text-slate-100'>{entry.user?.fullName || "Unknown member"}</p>
																		<p className='truncate text-xs text-slate-400'>@{entry.user?.username || "unknown"} · {entry.memberRole}</p>
																	</div>
																	<span className='rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100'>
																		{entry.messageCount} msgs
																	</span>
																</div>
																<p className='mt-2 text-xs text-slate-400'>
																	Last active {entry.lastInteractionAt ? new Date(entry.lastInteractionAt).toLocaleString() : "not available"}
																</p>
															</div>
														))}
													</div>
												</div>
											</div>

											<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
												<div className='flex items-center justify-between gap-3'>
													<div>
														<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Announcements</p>
														<p className='mt-1 text-sm text-slate-300'>Share important updates with everyone.</p>
													</div>
												</div>

												{canModerateGroup ? (
													<div className='mt-4 flex flex-col gap-3 sm:flex-row'>
														<textarea
															rows='2'
															value={newAnnouncement}
															onChange={(event) => setNewAnnouncement(event.target.value)}
															placeholder='Post a group announcement'
															className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
														/>
														<button
															type='button'
															onClick={handleCreateAnnouncement}
															className='rounded-full border border-sky-300/20 bg-sky-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100'
															disabled={!newAnnouncement.trim() || Boolean(groupWorkspaceAction)}
														>
															Post
														</button>
													</div>
												) : null}

												<div className='mt-4 space-y-2'>
													{(groupWorkspace.announcements || []).length ? (
														groupWorkspace.announcements.map((announcement) => (
															<div key={announcement.id} className='rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3'>
																<p className='text-sm leading-6 text-slate-100'>{announcement.content}</p>
																<p className='mt-2 text-xs text-slate-400'>
																	{announcement.createdBy?.fullName || "Unknown"} · {new Date(announcement.createdAt).toLocaleString()}
																</p>
															</div>
														))
													) : (
														<div className='rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-4 text-sm text-slate-400'>
															No announcements yet.
														</div>
													)}
												</div>
											</div>

											<div className='grid gap-4 xl:grid-cols-2'>
												<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
													<div>
														<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Polls</p>
														<p className='mt-1 text-sm text-slate-300'>Run quick decisions inside the group.</p>
													</div>

													{canModerateGroup ? (
														<div className='mt-4 space-y-3'>
															<input
																type='text'
																value={pollDraft.question}
																onChange={(event) => setPollDraft((currentDraft) => ({ ...currentDraft, question: event.target.value }))}
																placeholder='Poll question'
																className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															{pollDraft.options.map((option, index) => (
																<input
																	key={`poll-option-${index}`}
																	type='text'
																	value={option}
																	onChange={(event) => handlePollOptionChange(index, event.target.value)}
																	placeholder={`Option ${index + 1}`}
																	className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
																/>
															))}
															<div className='flex flex-wrap items-center gap-3'>
																<button
																	type='button'
																	onClick={handleAddPollOption}
																	className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100'
																	disabled={pollDraft.options.length >= 8}
																>
																	Add option
																</button>
																<label className='flex items-center gap-2 text-sm text-slate-300'>
																	<input
																		type='checkbox'
																		checked={pollDraft.allowsMultiple}
																		onChange={(event) =>
																			setPollDraft((currentDraft) => ({
																				...currentDraft,
																				allowsMultiple: event.target.checked,
																			}))
																		}
																		className='checkbox checkbox-sm checkbox-info'
																	/>
																	Allow multiple votes
																</label>
															</div>
															<input
																type='datetime-local'
																value={pollDraft.closesAt}
																onChange={(event) => setPollDraft((currentDraft) => ({ ...currentDraft, closesAt: event.target.value }))}
																className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															<button
																type='button'
																onClick={handleCreatePoll}
																className='rounded-full border border-sky-300/20 bg-sky-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100'
																disabled={Boolean(groupWorkspaceAction)}
															>
																Create poll
															</button>
														</div>
													) : null}

													<div className='mt-4 space-y-3'>
														{(groupWorkspace.polls || []).length ? (
															groupWorkspace.polls.map((poll) => (
																<div key={poll.id} className='rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3'>
																	<div className='flex items-start justify-between gap-3'>
																		<div>
																			<p className='text-sm font-semibold text-slate-100'>{poll.question}</p>
																			<p className='mt-1 text-xs text-slate-400'>
																				{poll.totalVotes} votes · {poll.allowsMultiple ? "Multiple choice" : "Single choice"}
																				{poll.closesAt ? ` · closes ${new Date(poll.closesAt).toLocaleString()}` : ""}
																			</p>
																		</div>
																	</div>
																	<div className='mt-3 flex flex-wrap gap-2'>
																		{poll.options.map((option) => (
																			<button
																				key={option.id}
																				type='button'
																				onClick={() => handleVotePoll(poll.id, option.id)}
																				className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
																					option.selectedByMe
																						? "border-cyan-300/35 bg-cyan-500/16 text-cyan-50"
																						: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]"
																				}`}
																				disabled={Boolean(groupWorkspaceAction)}
																			>
																				{option.label} · {option.voteCount}
																			</button>
																		))}
																	</div>
																</div>
															))
														) : (
															<div className='rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-4 text-sm text-slate-400'>
																No polls yet.
															</div>
														)}
													</div>
												</div>

												<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
													<div>
														<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Events</p>
														<p className='mt-1 text-sm text-slate-300'>Schedule launches, calls, and group moments.</p>
													</div>

													{canModerateGroup ? (
														<div className='mt-4 space-y-3'>
															<input
																type='text'
																value={eventDraft.title}
																onChange={(event) => setEventDraft((currentDraft) => ({ ...currentDraft, title: event.target.value }))}
																placeholder='Event title'
																className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															<textarea
																rows='2'
																value={eventDraft.description}
																onChange={(event) => setEventDraft((currentDraft) => ({ ...currentDraft, description: event.target.value }))}
																placeholder='Description'
																className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															<input
																type='text'
																value={eventDraft.location}
																onChange={(event) => setEventDraft((currentDraft) => ({ ...currentDraft, location: event.target.value }))}
																placeholder='Location or room'
																className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															<input
																type='datetime-local'
																value={eventDraft.startsAt}
																onChange={(event) => setEventDraft((currentDraft) => ({ ...currentDraft, startsAt: event.target.value }))}
																className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-300/30 focus:bg-white/[0.06]'
															/>
															<button
																type='button'
																onClick={handleCreateEvent}
																className='rounded-full border border-sky-300/20 bg-sky-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100'
																disabled={Boolean(groupWorkspaceAction)}
															>
																Create event
															</button>
														</div>
													) : null}

													<div className='mt-4 space-y-3'>
														{(groupWorkspace.events || []).length ? (
															groupWorkspace.events.map((event) => (
																<div key={event.id} className='rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3'>
																	<p className='text-sm font-semibold text-slate-100'>{event.title}</p>
																	<p className='mt-1 text-xs text-slate-400'>{new Date(event.startsAt).toLocaleString()}</p>
																	{event.location ? <p className='mt-2 text-xs text-slate-300'>Location: {event.location}</p> : null}
																	{event.description ? <p className='mt-2 text-sm leading-6 text-slate-200'>{event.description}</p> : null}
																</div>
															))
														) : (
															<div className='rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-4 text-sm text-slate-400'>
																No events scheduled yet.
															</div>
														)}
													</div>
												</div>
											</div>

											{canModerateGroup ? (
												<div className='grid gap-4 xl:grid-cols-2'>
													<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
														<div className='flex items-center justify-between gap-3'>
															<div>
																<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Invite links</p>
																<p className='mt-1 text-sm text-slate-300'>Create links that let people join or request access.</p>
															</div>
														</div>

														<div className='mt-4 flex flex-wrap items-center gap-3'>
															<select
																value={inviteLinkDays}
																onChange={(event) => setInviteLinkDays(event.target.value)}
																className='rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none'
															>
																<option value='1'>1 day</option>
																<option value='7'>7 days</option>
																<option value='14'>14 days</option>
																<option value='30'>30 days</option>
															</select>
															<button
																type='button'
																onClick={handleCreateInviteLink}
																className='rounded-full border border-sky-300/20 bg-sky-500/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100'
																disabled={Boolean(groupWorkspaceAction)}
															>
																Create link
															</button>
														</div>

														<div className='mt-4 space-y-2'>
															{(groupWorkspace.inviteLinks || []).length ? (
																groupWorkspace.inviteLinks.map((inviteLink) => (
																	<div key={inviteLink.id} className='rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3'>
																		<p className='truncate text-sm font-semibold text-slate-100'>{`${window.location.origin}/?groupInvite=${inviteLink.code}`}</p>
																		<p className='mt-1 text-xs text-slate-400'>
																			Expires {inviteLink.expiresAt ? new Date(inviteLink.expiresAt).toLocaleString() : "never"}
																		</p>
																		<div className='mt-3 flex flex-wrap gap-2'>
																			<button
																				type='button'
																				onClick={() => handleCopyInviteLink(inviteLink.code)}
																				className='rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100'
																			>
																				Copy
																			</button>
																			<button
																				type='button'
																				onClick={() => handleRevokeInviteLink(inviteLink.id)}
																				className='rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-100'
																				disabled={Boolean(groupWorkspaceAction)}
																			>
																				Revoke
																			</button>
																		</div>
																	</div>
																))
															) : (
																<div className='rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-4 text-sm text-slate-400'>
																	No active invite links.
																</div>
															)}
														</div>
													</div>

													<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
														<div>
															<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Join requests</p>
															<p className='mt-1 text-sm text-slate-300'>Approve or decline people waiting to get in.</p>
														</div>

														<div className='mt-4 space-y-2'>
															{(groupWorkspace.joinRequests || []).length ? (
																groupWorkspace.joinRequests.map((joinRequest) => (
																	<div key={joinRequest.id} className='rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3'>
																		<p className='text-sm font-semibold text-slate-100'>{joinRequest.requester?.fullName || "Unknown user"}</p>
																		<p className='mt-1 text-xs text-slate-400'>
																			@{joinRequest.requester?.username || "unknown"} · {new Date(joinRequest.createdAt).toLocaleString()}
																		</p>
																		{joinRequest.message ? (
																			<p className='mt-2 text-sm leading-6 text-slate-200'>{joinRequest.message}</p>
																		) : null}
																		<div className='mt-3 flex flex-wrap gap-2'>
																			<button
																				type='button'
																				onClick={() => handleRespondJoinRequest(joinRequest.id, "APPROVE")}
																				className='rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100'
																				disabled={Boolean(groupWorkspaceAction)}
																			>
																				Approve
																			</button>
																			<button
																				type='button'
																				onClick={() => handleRespondJoinRequest(joinRequest.id, "DECLINE")}
																				className='rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-100'
																				disabled={Boolean(groupWorkspaceAction)}
																			>
																				Decline
																			</button>
																		</div>
																	</div>
																))
															) : (
																<div className='rounded-[18px] border border-dashed border-white/10 bg-slate-950/20 px-4 py-4 text-sm text-slate-400'>
																	No pending join requests.
																</div>
															)}
														</div>
													</div>
												</div>
											) : null}
										</>
									) : null
								) : null}

								<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>About this group</p>
									<p className='mt-1 min-h-12 text-sm leading-6 text-slate-200'>
										{user.bio?.trim() || "No group description yet."}
									</p>
								</div>

								{user.members?.length ? (
									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Participants</p>
										<div className='mt-3 space-y-2'>
											{user.members.map((member) => (
												<div key={member._id} className='flex items-center gap-3 rounded-[18px] bg-slate-900/60 px-3 py-3'>
														<div
															className='min-w-0 flex-1'
															data-copy-user={member.username || undefined}
															title={member.username ? "Click to copy username" : undefined}
														>
															<p className='truncate text-sm font-medium text-slate-100'>
																{member.fullName}
																{member._id === authUser?._id ? " (You)" : ""}
															</p>
															<p className='truncate text-xs text-slate-400'>@{member.username}</p>
													</div>
													<div className='flex items-center gap-2'>
														<span className='shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300'>
															{member.memberRole || "Member"}
														</span>
														{canManageGroup &&
														member._id !== authUser?._id &&
														member.memberRole !== "OWNER" ? (
															<>
																{isGroupOwner ? (
																	<button
																		type='button'
																		onClick={() => handleUpdateMemberRole(member._id, "OWNER")}
																		className='rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																		disabled={hasPendingMemberAction}
																	>
																		{isMemberActionPending("role", member._id) ? "Saving..." : "Make owner"}
																	</button>
																) : null}
																{getRoleActionOptions(member.memberRole || "MEMBER").map((roleAction) => (
																	<button
																		key={`${member._id}-${roleAction.role}`}
																		type='button'
																		onClick={() => handleUpdateMemberRole(member._id, roleAction.role)}
																		className={roleAction.className}
																		disabled={hasPendingMemberAction}
																	>
																		{isMemberActionPending("role", member._id) ? "Saving..." : roleAction.label}
																	</button>
																))}
																<button
																	type='button'
																	onClick={() => handleRemoveMember(member._id)}
																	className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10 text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																	disabled={hasPendingMemberAction}
																	title='Remove member'
																>
																	<HiOutlineUserMinus className='h-4 w-4' />
																</button>
															</>
														) : null}
													</div>
												</div>
											))}
										</div>
									</div>
								) : null}
							</>
						) : (
							<>
								{user.role === "DEVELOPER" ? (
									<div className='rounded-[24px] border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(249,115,22,0.1))] px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-amber-100/80'>Account status</p>
										<p className='mt-1 text-sm leading-6 text-amber-50'>
											{user.isPrimaryDeveloper
												? "Lead developer account with elevated platform control."
												: "Official developer account."}
										</p>
									</div>
								) : null}

								{user.isVerified ? (
									<div className='rounded-[24px] border border-sky-300/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.16),rgba(6,182,212,0.1))] px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/80'>Verification</p>
										<p className='mt-1 text-sm leading-6 text-sky-50'>This profile has a developer-assigned verified badge.</p>
									</div>
								) : null}

								<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Conversation controls</p>
									<div className='mt-3 flex flex-wrap gap-2'>
										<button
											type='button'
											onClick={() =>
												handleDirectPreferenceUpdate(
													{ isArchived: !Boolean(user?.isArchived) },
													user?.isArchived ? "Conversation restored" : "Conversation archived"
												)
											}
											className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
											disabled={isDirectActionLoading}
										>
											{user?.isArchived ? <HiOutlineArrowLeftOnRectangle className='h-4 w-4' /> : <HiOutlineArchiveBoxXMark className='h-4 w-4' />}
											{user?.isArchived ? "Unarchive" : "Archive"}
										</button>
										<button
											type='button'
											onClick={() =>
												handleDirectPreferenceUpdate(
													{ mutedForSeconds: isConversationMuted ? 0 : 3600 },
													isConversationMuted ? "Conversation unmuted" : "Muted for 1 hour"
												)
											}
											className='inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-300/35 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60'
											disabled={isDirectActionLoading}
										>
											<HiOutlineBellSlash className='h-4 w-4' />
											{isConversationMuted ? "Unmute" : "Mute 1h"}
										</button>
										<button
											type='button'
											onClick={handleToggleBlockUser}
											className='inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
											disabled={isDirectActionLoading}
										>
											<HiOutlineUserMinus className='h-4 w-4' />
											{isBlockedUser ? "Unblock" : "Block user"}
										</button>
									</div>

									<div className='mt-4 rounded-[20px] border border-white/10 bg-slate-950/25 p-3'>
										<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400'>Disappearing messages</p>
										<div className='mt-3 flex flex-wrap gap-2'>
											{[
												{ label: "Off", value: null },
												{ label: "5m", value: 300 },
												{ label: "1h", value: 3600 },
												{ label: "1d", value: 86400 },
												{ label: "7d", value: 604800 },
											].map((option) => {
												const isActive = (user?.disappearingMessagesSeconds || null) === option.value;
												return (
													<button
														key={option.label}
														type='button'
														onClick={() => handleDisappearingUpdate(option.value)}
														className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
															isActive
																? "border-sky-300/35 bg-sky-500/16 text-sky-50"
																: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]"
														}`}
														disabled={isDirectActionLoading}
													>
														{option.label}
													</button>
												);
											})}
										</div>
									</div>
								</div>

								<div className='grid gap-3 sm:grid-cols-2'>
										<div
											className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'
											data-copy-user={user.username || undefined}
											title={user.username ? "Click to copy username" : undefined}
										>
											<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Username</p>
											<p className='mt-1 text-base font-medium text-slate-100'>@{user.username}</p>
										</div>

									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Gender</p>
										<p className='mt-1 text-base font-medium capitalize text-slate-100'>{user.gender || "Unknown"}</p>
									</div>
								</div>

								<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Bio</p>
									<p className='mt-1 min-h-12 text-sm leading-6 text-slate-200'>{user.bio?.trim() || "No bio added yet."}</p>
								</div>
							</>
						)}

						<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
							<div className='flex flex-wrap items-center justify-between gap-3'>
								<div>
									<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Conversation tools</p>
									<p className='mt-1 text-sm text-slate-300'>Search messages, open pins, browse gallery files, and inspect saved messages.</p>
								</div>
								<div className='flex flex-wrap gap-2'>
									<button
										type='button'
										onClick={handleLoadPinnedMessages}
										className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100 transition hover:bg-white/[0.08]'
									>
										Pins
									</button>
									<button
										type='button'
										onClick={handleLoadGallery}
										className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100 transition hover:bg-white/[0.08]'
									>
										Gallery
									</button>
									<button
										type='button'
										onClick={handleLoadSavedMessages}
										className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-100 transition hover:bg-white/[0.08]'
									>
										Saved
									</button>
								</div>
							</div>

							<div className='mt-4 flex gap-2'>
								<div className='relative min-w-0 flex-1'>
									<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
									<input
										type='text'
										value={toolSearchQuery}
										onChange={(event) => setToolSearchQuery(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												handleSearchConversation();
											}
										}}
										placeholder='Search inside this conversation'
										className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
									/>
								</div>
								<button
									type='button'
									onClick={handleSearchConversation}
									className='rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16'
								>
									Search
								</button>
							</div>

							<div className='mt-3 flex flex-wrap gap-2'>
								{[
									{ id: "all", label: "Messages" },
									{ id: "files", label: "Files" },
									{ id: "links", label: "Links" },
								].map((option) => {
									const isActive = toolSearchMode === option.id;
									return (
										<button
											key={option.id}
											type='button'
											onClick={() => setToolSearchMode(option.id)}
											className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
												isActive
													? "border-sky-300/35 bg-sky-500/16 text-sky-50"
													: "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]"
											}`}
										>
											{option.label}
										</button>
									);
								})}
							</div>

							{toolLoadingState ? (
								<div className='mt-4 rounded-[20px] border border-white/10 bg-slate-950/30 px-4 py-4 text-sm text-slate-400'>
									Loading {toolLoadingState}...
								</div>
							) : null}

							{toolSearchResults.length > 0 ? (
								<div className='mt-4 space-y-2'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Search results</p>
									{toolSearchResults.map((result) => (
										<button
											key={`search-${result._id}`}
											type='button'
											onClick={() => dispatchJumpToMessage(result._id)}
											className='block w-full rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900/70'
										>
											<p className='truncate text-sm font-semibold text-white'>{result.previewText || result.message || "Message"}</p>
											<p className='mt-1 text-xs text-slate-400'>{new Date(result.createdAt).toLocaleString()}</p>
										</button>
									))}
								</div>
							) : null}

							{toolPanelState.searched && !toolLoadingState && toolSearchResults.length === 0 ? (
								<div className='mt-4 rounded-[18px] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-400'>
									No {toolSearchMode === "files" ? "file" : toolSearchMode === "links" ? "link" : "message"} matches found in this conversation.
								</div>
							) : null}

							{pinnedItems.length > 0 ? (
								<div className='mt-4 space-y-2'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Pinned messages</p>
									{pinnedItems.map((entry) => (
										<button
											key={`pin-${entry.id}`}
											type='button'
											onClick={() => dispatchJumpToMessage(entry.message?._id)}
											className='block w-full rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900/70'
										>
											<p className='truncate text-sm font-semibold text-white'>{entry.message?.previewText || entry.message?.message || "Pinned message"}</p>
											<p className='mt-1 text-xs text-slate-400'>{new Date(entry.pinnedAt).toLocaleString()}</p>
										</button>
									))}
								</div>
							) : null}

							{toolPanelState.pinsLoaded && !toolLoadingState && pinnedItems.length === 0 ? (
								<div className='mt-4 rounded-[18px] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-400'>
									No pinned messages in this conversation yet.
								</div>
							) : null}

							{galleryItems.length > 0 ? (
								<div className='mt-4 space-y-2'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Media & files</p>
									<div className='grid gap-2 sm:grid-cols-2'>
										{galleryItems.slice(0, 8).map((item) => (
											<button
												key={`gallery-${item._id}`}
												type='button'
												onClick={() => dispatchJumpToMessage(item._id)}
												className='rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900/70'
											>
												<p className='truncate text-sm font-semibold text-white'>
													{item.attachment?.fileName || item.previewText || "Media item"}
												</p>
												<p className='mt-1 text-xs text-slate-400'>{item.audio ? "Audio" : item.attachment?.type || "Attachment"}</p>
											</button>
										))}
									</div>
								</div>
							) : null}

							{toolPanelState.galleryLoaded && !toolLoadingState && galleryItems.length === 0 ? (
								<div className='mt-4 rounded-[18px] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-400'>
									No media, audio, or files shared here yet.
								</div>
							) : null}

							{savedItems.length > 0 ? (
								<div className='mt-4 space-y-2'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500'>Saved messages in this chat</p>
									{savedItems.slice(0, 6).map((entry) => (
										<button
											key={`saved-${entry.message?._id || entry.savedAt}`}
											type='button'
											onClick={() => dispatchJumpToMessage(entry.message?._id)}
											className='block w-full rounded-[18px] border border-white/10 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900/70'
										>
											<p className='truncate text-sm font-semibold text-white'>
												{entry.message?.previewText || entry.message?.message || "Saved message"}
											</p>
											<p className='mt-1 text-xs text-slate-400'>
												{entry.message?.sender?.fullName || "Unknown sender"} · {new Date(entry.savedAt).toLocaleString()}
											</p>
										</button>
									))}
								</div>
							) : null}

							{toolPanelState.savedLoaded && !toolLoadingState && savedItems.length === 0 ? (
								<div className='mt-4 rounded-[18px] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-400'>
									You do not have any saved messages in this conversation yet.
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default UserInfoModal;
