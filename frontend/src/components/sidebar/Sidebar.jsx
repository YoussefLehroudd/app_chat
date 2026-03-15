import { Link } from "react-router-dom";
import {
	IoArrowBackOutline,
	IoArchiveOutline,
	IoChevronDownOutline,
	IoChevronUpOutline,
	IoCodeSlashOutline,
	IoNotificationsOutline,
	IoOpenOutline,
	IoPinOutline,
	IoTrashOutline,
	IoVolumeHighOutline,
	IoVolumeMuteOutline,
} from "react-icons/io5";
import { HiOutlineLink, HiOutlineUserGroup, HiOutlineUserPlus } from "react-icons/hi2";
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import BroadcastInboxPanel from "./BroadcastInboxPanel";
import CallDirectory from "./CallDirectory";
import Conversation from "./Conversation";
import Conversations from "./Conversations";
import CreateGroupModal from "./CreateGroupModal";
import DirectInviteModal from "./DirectInviteModal";
import DirectInvitationsPanel from "./DirectInvitationsPanel";
import JoinGroupLinkModal from "./JoinGroupLinkModal";
import LogoutButton from "./LogoutButton";
import SearchInput from "./SearchInput";
import ProfileButton from "./ProfileButton";
import StoriesBar from "./StoriesBar";
import StoryComposerModal from "./StoryComposerModal";
import StoryViewerModal from "./StoryViewerModal";
import useCallDirectory from "../../hooks/useCallDirectory";
import useGetConversations from "../../hooks/useGetConversations";
import useDirectInvitations from "../../hooks/useDirectInvitations";
import useStories from "../../hooks/useStories";
import useHorizontalDragScroll from "../../hooks/useHorizontalDragScroll";
import { useSocketContext } from "../../context/SocketContext";
import { useAuthContext } from "../../context/AuthContext";
import useConversation from "../../zustand/useConversation";
import { matchesUserSearchQuery, normalizeUserSearchQuery } from "../../utils/search";

const STORY_OPEN_REQUEST_EVENT = "chat:open-story-from-message";
const PINNED_CONVERSATIONS_STORAGE_KEY_PREFIX = "chat-pinned-conversations";
const CONTEXT_MENU_WIDTH = 288;
const CONTEXT_MENU_HEIGHT = 392;

const FILTERS = [
	{ id: "all", label: "All" },
	{ id: "archived", label: "Archived" },
	{ id: "online", label: "Online" },
	{ id: "calls", label: "Calls" },
];

const getClampedContextMenuPosition = (left, top, width, height) => {
	const maxLeft = Math.max(12, window.innerWidth - width - 12);
	const maxTop = Math.max(12, window.innerHeight - height - 12);

	return {
		left: Math.min(Math.max(12, left), maxLeft),
		top: Math.min(Math.max(12, top), maxTop),
	};
};

const prefersMobileConversationMenu = () => {
	if (typeof window === "undefined") {
		return false;
	}

	const supportsMatchMedia = typeof window.matchMedia === "function";
	return window.innerWidth < 768 || (supportsMatchMedia ? window.matchMedia("(pointer: coarse)").matches : false);
};

const getUserId = (user) => user?._id || user?.id || null;
const getPinnedConversationsStorageKey = (userId) => `${PINNED_CONVERSATIONS_STORAGE_KEY_PREFIX}:${userId || "anonymous"}`;
const areConversationIdListsEqual = (leftList, rightList) =>
	leftList.length === rightList.length && leftList.every((value, index) => value === rightList[index]);

const readPinnedConversationIds = (userId) => {
	try {
		const rawValue = localStorage.getItem(getPinnedConversationsStorageKey(userId));
		const parsedValue = JSON.parse(rawValue || "[]");
		return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === "string" && value.trim()) : [];
	} catch {
		return [];
	}
};

const writePinnedConversationIds = (userId, conversationIds) => {
	try {
		localStorage.setItem(getPinnedConversationsStorageKey(userId), JSON.stringify(conversationIds));
	} catch {
		// Ignore storage write failures.
	}
};

const normalizePinnedConversationIds = (conversationIds, conversations) => {
	const activeConversationIds = new Set(
		(conversations || [])
			.filter((conversation) => conversation?._id && !conversation?.isArchived)
			.map((conversation) => conversation._id)
	);

	return [...new Set((conversationIds || []).filter((conversationId) => activeConversationIds.has(conversationId)))].slice(0, 4);
};

const Sidebar = () => {
	const [searchValue, setSearchValue] = useState("");
	const [activeFilter, setActiveFilter] = useState("all");
	const [showQuickActions, setShowQuickActions] = useState(false);
	const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
	const [showDirectInviteModal, setShowDirectInviteModal] = useState(false);
	const [showJoinGroupLinkModal, setShowJoinGroupLinkModal] = useState(false);
	const [showInvitationsPanel, setShowInvitationsPanel] = useState(false);
	const [showStoryComposer, setShowStoryComposer] = useState(false);
	const [showStoryViewer, setShowStoryViewer] = useState(false);
	const [showBroadcastInbox, setShowBroadcastInbox] = useState(false);
	const [storyViewerTarget, setStoryViewerTarget] = useState(null);
	const [storyViewerGroupsOverride, setStoryViewerGroupsOverride] = useState(null);
	const { loading, conversations } = useGetConversations();
	const {
		incomingInvitations,
		outgoingInvitations,
		pendingCounterpartIds,
		sendInvitation,
		respondInvitation,
		isSendingToUser,
		isRespondingToInvitation,
	} = useDirectInvitations();
	const { loading: loadingCalls, calls } = useCallDirectory();
	const {
		storyGroups,
		ownStoryGroup,
		loadingStories,
		creatingStory,
		refreshStories,
		createStory,
		markStoryAsSeen,
		deleteStory,
		getStoryViewers,
		reactToStory,
		commentOnStory,
	} = useStories();
	const { onlineUsers, broadcastAnnouncements, unreadBroadcastCount, markBroadcastsRead, dismissBroadcast, clearBroadcasts } =
		useSocketContext();
	const { authUser } = useAuthContext();
	const { selectedConversation, setSelectedConversation, setShowSidebar, setMessages, setRepliedMessage } =
		useConversation();
	const storageUserId = getUserId(authUser);
	const isDeveloper = authUser?.role === "DEVELOPER";
	const resolvedStoryGroups = Array.isArray(storyViewerGroupsOverride) ? storyViewerGroupsOverride : storyGroups;
	const handledInviteCodeRef = useRef("");
	const conversationMenuPanelRef = useRef(null);
	const { containerRef: filterRowRef, isDragging: isDraggingFilterRow, dragScrollProps: filterRowDragScrollProps } =
		useHorizontalDragScroll();
	const [pinnedConversationIds, setPinnedConversationIds] = useState(() => readPinnedConversationIds(storageUserId));
	const [pinnedDragConversationId, setPinnedDragConversationId] = useState("");
	const [conversationMenu, setConversationMenu] = useState(null);
	const [deleteConversationDialog, setDeleteConversationDialog] = useState(null);
	const [isDeletingConversation, setIsDeletingConversation] = useState(false);

	useEffect(() => {
		setPinnedConversationIds(readPinnedConversationIds(storageUserId));
	}, [storageUserId]);

	useEffect(() => {
		setPinnedConversationIds((currentIds) => {
			const normalizedIds = normalizePinnedConversationIds(currentIds, conversations);
			return areConversationIdListsEqual(currentIds, normalizedIds) ? currentIds : normalizedIds;
		});
	}, [conversations]);

	useEffect(() => {
		writePinnedConversationIds(storageUserId, pinnedConversationIds);
	}, [pinnedConversationIds, storageUserId]);

	const onlineCount = useMemo(
		() => conversations.filter((conversation) => onlineUsers.includes(conversation._id)).length,
		[conversations, onlineUsers]
	);
	const archivedCount = useMemo(
		() => conversations.filter((conversation) => Boolean(conversation?.isArchived)).length,
		[conversations]
	);
	const directFriendConversations = useMemo(
		() => conversations.filter((conversation) => conversation?.type === "DIRECT" && !conversation?.isGroup),
		[conversations]
	);
	const directConnectedUserIds = useMemo(
		() =>
			new Set(
				directFriendConversations
					.map((conversation) => getUserId(conversation))
					.filter((userId) => typeof userId === "string" && userId)
			),
		[directFriendConversations]
	);

	const filteredConversations = useMemo(() => {
		const normalizedSearch = normalizeUserSearchQuery(searchValue);

		return conversations.filter((conversation) => {
			const isArchivedConversation = Boolean(conversation?.isArchived);
			const matchesFilter =
				(activeFilter === "all" && !isArchivedConversation) ||
				(activeFilter === "archived" && isArchivedConversation) ||
				(activeFilter === "online" && !isArchivedConversation && onlineUsers.includes(conversation._id));
			if (!matchesFilter) return false;
			if (!normalizedSearch) return true;

			return matchesUserSearchQuery(searchValue, [
				conversation.fullName,
				conversation.username,
				conversation.bio,
				conversation.lastMessage,
			]);
		});
	}, [activeFilter, conversations, onlineUsers, searchValue]);

	const pinnedConversations = useMemo(() => {
		const pinnedConversationMap = new Map(conversations.map((conversation) => [conversation._id, conversation]));
		return pinnedConversationIds
			.map((conversationId) => pinnedConversationMap.get(conversationId))
			.filter((conversation) => Boolean(conversation) && !conversation.isArchived);
	}, [conversations, pinnedConversationIds]);

	const visiblePinnedConversations = useMemo(() => {
		if (activeFilter === "calls" || activeFilter === "archived") {
			return [];
		}

		const normalizedSearch = normalizeUserSearchQuery(searchValue);
		return pinnedConversations.filter((conversation) => {
			if (activeFilter === "online" && !onlineUsers.includes(conversation._id)) {
				return false;
			}

			if (!normalizedSearch) {
				return true;
			}

			return matchesUserSearchQuery(searchValue, [
				conversation.fullName,
				conversation.username,
				conversation.bio,
				conversation.lastMessage,
			]);
		});
	}, [activeFilter, onlineUsers, pinnedConversations, searchValue]);

	const visiblePinnedConversationIds = useMemo(
		() => new Set(visiblePinnedConversations.map((conversation) => conversation._id)),
		[visiblePinnedConversations]
	);

	const regularFilteredConversations = useMemo(
		() => filteredConversations.filter((conversation) => !visiblePinnedConversationIds.has(conversation._id)),
		[filteredConversations, visiblePinnedConversationIds]
	);

	const filteredCalls = useMemo(() => {
		const normalizedSearch = normalizeUserSearchQuery(searchValue);
		if (!normalizedSearch) return calls;

		return calls.filter((call) =>
			matchesUserSearchQuery(searchValue, [
				call.title,
				call.previewText,
				call.initiator?.fullName,
				call.initiator?.username,
				...(Array.isArray(call.participants)
					? call.participants.flatMap((participant) => [participant.user?.fullName, participant.user?.username])
					: []),
			])
		);
	}, [calls, searchValue]);

	const emptyTitle = searchValue
		? "No match found"
		: activeFilter === "calls"
			? "No calls yet"
		: activeFilter === "archived"
			? "No archived chats"
		: activeFilter === "online"
			? "Nobody is online right now"
			: "No conversations yet";

	const emptyDescription = searchValue
		? "Try another name, username or keyword from the last message preview."
		: activeFilter === "calls"
			? "Every live and recent call will appear here, with quick join access while a call is active."
		: activeFilter === "archived"
			? "Archived conversations will stay here until you open one and restore it."
		: activeFilter === "online"
			? "Switch back to all conversations or wait for someone to come online."
			: "Your contacts will appear here as soon as the sidebar data loads.";

	const closeConversationMenu = useCallback(() => {
		setConversationMenu(null);
	}, []);

	const closeDeleteConversationDialog = useCallback(() => {
		if (isDeletingConversation) return;
		setDeleteConversationDialog(null);
	}, [isDeletingConversation]);

	const handleOpenConversation = useCallback((conversation) => {
		if (!conversation?._id) return;
		startTransition(() => {
			setSelectedConversation(conversation);
			setShowSidebar(false);
		});
	}, [setSelectedConversation, setShowSidebar]);

	const requestDeleteConversation = useCallback(
		(conversation) => {
			if (!conversation?._id || isDeletingConversation) return;
			closeConversationMenu();
			setDeleteConversationDialog(conversation);
		},
		[closeConversationMenu, isDeletingConversation]
	);

	const handleDeleteConversation = useCallback(async () => {
		if (!deleteConversationDialog?._id || isDeletingConversation) return;

		const conversationToDelete = deleteConversationDialog;
		const { messages, repliedMessage } = useConversation.getState();
		const isActiveConversation = selectedConversation?._id === conversationToDelete._id;

		setIsDeletingConversation(true);
		setDeleteConversationDialog(null);

		if (isActiveConversation) {
			setMessages([]);
			setRepliedMessage(null);
			setShowSidebar(true);
			setSelectedConversation(null);
		}

		window.dispatchEvent(
			new CustomEvent("chat:conversation-removed", {
				detail: { conversationId: conversationToDelete._id },
			})
		);

		try {
			const endpoint =
				conversationToDelete.type === "GROUP"
					? `/api/messages/conversation/group/${conversationToDelete._id}`
					: `/api/messages/conversation/${conversationToDelete._id}`;
			const response = await fetch(endpoint, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${localStorage.getItem("token")}`,
				},
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete conversation");
			}

			window.dispatchEvent(new Event("chat:conversations-refresh"));
			toast.success("Conversation deleted");
		} catch (error) {
			window.dispatchEvent(
				new CustomEvent("chat:conversation-restored", {
					detail: { conversation: conversationToDelete },
				})
			);

			if (isActiveConversation) {
				setMessages(messages);
				setRepliedMessage(repliedMessage);
				setSelectedConversation(conversationToDelete);
				setShowSidebar(false);
			}

			toast.error(error.message);
		} finally {
			setIsDeletingConversation(false);
		}
	}, [
		deleteConversationDialog,
		isDeletingConversation,
		selectedConversation?._id,
		setMessages,
		setRepliedMessage,
		setSelectedConversation,
		setShowSidebar,
	]);

	const handleTogglePinConversation = useCallback((conversation) => {
		if (!conversation?._id) return;
		if (conversation?.isArchived) return;

		setPinnedConversationIds((currentIds) => {
			if (currentIds.includes(conversation._id)) {
				toast.success("Conversation unpinned");
				return currentIds.filter((conversationId) => conversationId !== conversation._id);
			}

			if (currentIds.length >= 4) {
				toast.error("You can pin up to 4 conversations");
				return currentIds;
			}

			toast.success("Conversation pinned");
			return [conversation._id, ...currentIds];
		});
	}, []);

	const movePinnedConversation = useCallback((draggedConversationId, targetConversationId) => {
		if (!draggedConversationId || !targetConversationId || draggedConversationId === targetConversationId) {
			return;
		}

		setPinnedConversationIds((currentIds) => {
			const draggedIndex = currentIds.indexOf(draggedConversationId);
			const targetIndex = currentIds.indexOf(targetConversationId);
			if (draggedIndex === -1 || targetIndex === -1) {
				return currentIds;
			}

			const nextIds = [...currentIds];
			nextIds.splice(draggedIndex, 1);
			nextIds.splice(targetIndex, 0, draggedConversationId);
			return nextIds;
		});
	}, []);

	const handleConversationPreferenceUpdate = useCallback(
		async (conversation, payload, successMessage, { removePin = false } = {}) => {
			const conversationId = conversation?.conversationId || conversation?._id;
			if (!conversationId) return;

			try {
				const response = await fetch(`/api/conversations/${conversationId}/preferences`, {
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

				if (removePin && conversation?._id) {
					setPinnedConversationIds((currentIds) =>
						currentIds.filter((currentConversationId) => currentConversationId !== conversation._id)
					);
				}

				window.dispatchEvent(new Event("chat:conversations-refresh"));
				toast.success(successMessage);
			} catch (error) {
				toast.error(error.message);
			}
		},
		[]
	);

	const handleOpenConversationMenu = useCallback((event, conversation) => {
		event.preventDefault();
		event.stopPropagation();

		const useMobileLayout = prefersMobileConversationMenu();
		if (useMobileLayout) {
			setConversationMenu({
				conversation,
				left: 12,
				top: 12,
				layout: "mobile",
			});
			return;
		}

		const { left, top } = getClampedContextMenuPosition(
			event.clientX,
			event.clientY,
			CONTEXT_MENU_WIDTH,
			CONTEXT_MENU_HEIGHT
		);

		setConversationMenu({
			conversation,
			left,
			top,
			layout: "desktop",
		});
	}, []);

	const handleOpenConversationMenuFromLongPress = useCallback((payload) => {
		if (!payload?.conversation) return;

		setConversationMenu({
			conversation: payload.conversation,
			left: 12,
			top: 12,
			layout: "mobile",
		});
	}, []);

	const getConversationMenuActions = useCallback(
		(activeConversation) => {
			if (!activeConversation?._id) {
				return [];
			}

			const isPinnedConversation = pinnedConversationIds.includes(activeConversation._id);
			const isMutedConversation =
				Boolean(activeConversation.mutedUntil) && new Date(activeConversation.mutedUntil).getTime() > Date.now();

			return [
				{
					label: "Open chat",
					description: "Open this conversation now.",
					icon: IoOpenOutline,
					iconClassName: "text-cyan-100",
					onClick: () => handleOpenConversation(activeConversation),
				},
				!activeConversation.isArchived
					? {
							label: isPinnedConversation ? "Unpin from top" : "Pin to top",
							description: isPinnedConversation
								? "Remove it from the pinned section."
								: "Keep this chat above the others.",
							icon: IoPinOutline,
							iconClassName: "text-sky-100",
							onClick: () => handleTogglePinConversation(activeConversation),
					  }
					: null,
				{
					label: activeConversation.isArchived ? "Unarchive" : "Archive",
					description: activeConversation.isArchived
						? "Return it to your main chat list."
						: "Hide it from the main list without deleting it.",
					icon: IoArchiveOutline,
					iconClassName: activeConversation.isArchived ? "text-emerald-100" : "text-amber-100",
					onClick: () =>
						handleConversationPreferenceUpdate(
							activeConversation,
							{ isArchived: !Boolean(activeConversation.isArchived) },
							activeConversation.isArchived ? "Conversation restored" : "Conversation archived",
							{ removePin: !activeConversation.isArchived }
						),
				},
				{
					label: isMutedConversation ? "Unmute" : "Mute 1 hour",
					description: isMutedConversation
						? "Start receiving notifications again."
						: "Silence alerts for the next hour.",
					icon: isMutedConversation ? IoVolumeHighOutline : IoVolumeMuteOutline,
					iconClassName: isMutedConversation ? "text-emerald-100" : "text-violet-100",
					onClick: () =>
						handleConversationPreferenceUpdate(
							activeConversation,
							{
								mutedForSeconds: isMutedConversation ? 0 : 3600,
							},
							isMutedConversation ? "Conversation unmuted" : "Muted for 1 hour"
						),
				},
				{
					label: "Delete conversation",
					description: "Remove this chat from your conversation list.",
					icon: IoTrashOutline,
					iconClassName: "text-rose-200",
					onClick: () => requestDeleteConversation(activeConversation),
				},
			].filter(Boolean);
		},
		[
			handleConversationPreferenceUpdate,
			handleOpenConversation,
			handleTogglePinConversation,
			pinnedConversationIds,
			requestDeleteConversation,
		]
	);

	useLayoutEffect(() => {
		if (!conversationMenu || conversationMenu.layout === "mobile" || !conversationMenuPanelRef.current) return;

		const panelRect = conversationMenuPanelRef.current.getBoundingClientRect();
		const { left, top } = getClampedContextMenuPosition(
			conversationMenu.left,
			conversationMenu.top,
			panelRect.width,
			panelRect.height
		);

		if (left !== conversationMenu.left || top !== conversationMenu.top) {
			setConversationMenu((currentMenu) =>
				currentMenu
					? {
							...currentMenu,
							left,
							top,
					  }
					: currentMenu
			);
		}
	}, [conversationMenu]);

	useEffect(() => {
		if (!conversationMenu) return undefined;

		const handleViewportChange = () => {
			setConversationMenu((currentMenu) => (currentMenu ? { ...currentMenu } : currentMenu));
		};

		window.addEventListener("resize", handleViewportChange);

		return () => {
			window.removeEventListener("resize", handleViewportChange);
		};
	}, [conversationMenu]);

	const handleOpenCallConversation = useCallback((call) => {
		const relatedConversation = conversations.find((conversation) =>
			conversation.type === "GROUP"
				? conversation._id === call.conversationId
				: conversation.conversationId === call.conversationId
		);

		if (!relatedConversation) {
			toast.error("Conversation not available");
			return;
		}

		setSelectedConversation(relatedConversation);
		setShowSidebar(false);
	}, [conversations, setSelectedConversation, setShowSidebar]);

	const handleOpenFriendConversation = useCallback((friendConversation) => {
		if (!friendConversation?._id) return;
		startTransition(() => {
			setSelectedConversation(friendConversation);
			setShowSidebar(false);
		});
	}, [setSelectedConversation, setShowSidebar]);

	const handleOpenStoryViewer = useCallback((group, storyId) => {
		const targetUserId = getUserId(group?.user);
		if (!targetUserId || !storyId) return;
		startTransition(() => {
			setStoryViewerGroupsOverride(null);
			setStoryViewerTarget({
				userId: targetUserId,
				storyId,
			});
			setShowSidebar(true);
			setShowStoryViewer(true);
		});
	}, [setShowSidebar]);

	const handleOpenStoryComposer = useCallback(() => {
		if (creatingStory) return;

		const ownPendingStory = ownStoryGroup?.stories?.findLast?.((story) => story?.isPendingUpload)
			|| [...(ownStoryGroup?.stories || [])].reverse().find((story) => story?.isPendingUpload);
		if (ownPendingStory?._id) {
			const authUserId = getUserId(authUser);
			if (!authUserId) return;

			startTransition(() => {
				setStoryViewerGroupsOverride(null);
				setStoryViewerTarget({
					userId: authUserId,
					storyId: ownPendingStory._id,
				});
				setShowSidebar(true);
				setShowStoryViewer(true);
			});
			return;
		}

		startTransition(() => {
			setShowStoryComposer(true);
		});
	}, [authUser, creatingStory, ownStoryGroup, setShowSidebar]);

	const handleOpenCreateGroupModal = useCallback(() => {
		startTransition(() => {
			setShowCreateGroupModal(true);
		});
	}, []);

	const handleOpenDirectInviteModal = useCallback(() => {
		startTransition(() => {
			setShowDirectInviteModal(true);
		});
	}, []);

	const handleOpenJoinGroupLinkModal = useCallback(() => {
		startTransition(() => {
			setShowJoinGroupLinkModal(true);
		});
	}, []);

	const handleRestoreConversation = useCallback((conversation) => {
		if (!conversation?._id) return;

		window.dispatchEvent(
			new CustomEvent("chat:conversation-restored", {
				detail: { conversation },
			})
		);
		setSelectedConversation(conversation);
		setShowSidebar(false);
	}, [setSelectedConversation, setShowSidebar]);

	const handleJoinGroupByInviteLink = useCallback(
		async (inviteLink) => {
			const normalizedInviteLink = typeof inviteLink === "string" ? inviteLink.trim() : "";
			if (!normalizedInviteLink) return false;

			try {
				const response = await fetch("/api/conversations/groups/join-by-link", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ inviteLink: normalizedInviteLink }),
				});
				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || "Failed to join group");
				}

				if (data.status === "JOINED" && data.conversation) {
					handleRestoreConversation(data.conversation);
					toast.success("Group joined");
					return true;
				}

				if (data.status === "REQUESTED") {
					window.dispatchEvent(new Event("chat:conversations-refresh"));
					toast.success("Join request sent");
					return true;
				}

				toast.success("Invite link processed");
				return true;
			} catch (error) {
				toast.error(error.message);
				return false;
			}
		},
		[handleRestoreConversation]
	);

	const handleCreateStory = useCallback(
		(storyInput) => {
			const result = createStory(storyInput);
			return result;
		},
		[createStory]
	);

	const handleClearSearch = useCallback(() => {
		setSearchValue("");
	}, []);

	const handleToggleBroadcastInbox = useCallback(() => {
		const nextOpenState = !showBroadcastInbox;
		if (nextOpenState) {
			markBroadcastsRead();
			setShowQuickActions(false);
		}
		setShowBroadcastInbox(nextOpenState);
	}, [markBroadcastsRead, showBroadcastInbox]);

	useEffect(() => {
		if (!conversationMenu) return undefined;

		const handleCloseMenu = () => {
			closeConversationMenu();
		};

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				closeConversationMenu();
			}
		};

		if (conversationMenu.layout !== "mobile") {
			window.addEventListener("click", handleCloseMenu);
			window.addEventListener("contextmenu", handleCloseMenu);
			window.addEventListener("resize", handleCloseMenu);
		}
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("click", handleCloseMenu);
			window.removeEventListener("contextmenu", handleCloseMenu);
			window.removeEventListener("resize", handleCloseMenu);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [closeConversationMenu, conversationMenu]);

	useEffect(() => {
		if (!creatingStory) return undefined;

		const handleBeforeUnload = (event) => {
			event.preventDefault();
			event.returnValue = "A story upload is still in progress.";
			return event.returnValue;
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [creatingStory]);

	useEffect(() => {
		const buildFallbackStoryGroup = (story, userId) => {
			if (!story?._id || !userId) return null;

			const author = story.author || {
				_id: userId,
				fullName: story.storyOwnerName || "Story owner",
				username: "story",
				profilePic: "",
				gender: null,
			};

			const fallbackStory = {
				_id: story._id,
				userId,
				text: story.text || "",
				mediaUrl: story.mediaUrl || null,
				mediaType: story.mediaType || "TEXT",
				mediaMimeType: null,
				author,
				isOwn: userId === getUserId(authUser),
				isSeen: false,
				seenAt: null,
				viewCount: Number.isFinite(story.viewCount) ? story.viewCount : 0,
				createdAt: story.createdAt || new Date().toISOString(),
				updatedAt: story.updatedAt || story.createdAt || new Date().toISOString(),
				expiresAt: story.expiresAt || null,
			};

			return [
				{
					user: author,
					stories: [fallbackStory],
					hasUnseen: false,
					unseenCount: 0,
					latestCreatedAt: fallbackStory.createdAt,
				},
			];
		};

		const openStoryByTarget = (groups, userId, storyId) => {
			if (!Array.isArray(groups) || groups.length === 0) return false;
			const matchedGroup = groups.find((group) => getUserId(group?.user) === userId);
			if (!matchedGroup || !Array.isArray(matchedGroup.stories) || matchedGroup.stories.length === 0) return false;

			const matchedStory = matchedGroup.stories.find((story) => story?._id === storyId) || matchedGroup.stories[0];
			if (!matchedStory?._id) return false;

			setStoryViewerGroupsOverride(groups === storyGroups ? null : groups);
			setStoryViewerTarget({
				userId,
				storyId: matchedStory._id,
			});
			setShowSidebar(true);
			setShowStoryViewer(true);
			return true;
		};

		const handleOpenStoryFromMessage = async (event) => {
			const targetUserId = event.detail?.userId;
			const targetStoryId = event.detail?.storyId;
			const fallbackStory = event.detail?.story;
			if (!targetUserId || !targetStoryId) return;

			if (openStoryByTarget(storyGroups, targetUserId, targetStoryId)) {
				return;
			}

			const refreshedGroups = await refreshStories({ silent: true });
			if (openStoryByTarget(refreshedGroups, targetUserId, targetStoryId)) {
				return;
			}

			const fallbackGroups = buildFallbackStoryGroup(
				{
					...fallbackStory,
					_id: targetStoryId,
					mediaUrl: fallbackStory?.mediaUrl || fallbackStory?.storyMediaUrl || null,
					mediaType: fallbackStory?.mediaType || fallbackStory?.storyMediaType || "TEXT",
					text: fallbackStory?.text || fallbackStory?.storyText || "",
					storyOwnerName: fallbackStory?.author?.fullName || fallbackStory?.storyOwnerName || null,
				},
				targetUserId
			);

			if (fallbackGroups && openStoryByTarget(fallbackGroups, targetUserId, targetStoryId)) {
				return;
			}

			toast.error("Story is no longer available");
		};

		window.addEventListener(STORY_OPEN_REQUEST_EVENT, handleOpenStoryFromMessage);
		return () => {
			window.removeEventListener(STORY_OPEN_REQUEST_EVENT, handleOpenStoryFromMessage);
		};
	}, [authUser, refreshStories, storyGroups]);

	useEffect(() => {
		const currentUrl = new URL(window.location.href);
		const inviteCode = currentUrl.searchParams.get("groupInvite");
		if (!inviteCode || handledInviteCodeRef.current === inviteCode) {
			return;
		}

		handledInviteCodeRef.current = inviteCode;

		const clearInviteCodeFromUrl = () => {
			const nextUrl = new URL(window.location.href);
			nextUrl.searchParams.delete("groupInvite");
			const nextLocation = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
			window.history.replaceState({}, "", nextLocation);
		};

		void handleJoinGroupByInviteLink(inviteCode).finally(clearInviteCodeFromUrl);
	}, [handleJoinGroupByInviteLink]);

	const getConversationItemProps = useCallback(
		(conversation, options = {}) => ({
			onContextMenu: handleOpenConversationMenu,
			onLongPress: handleOpenConversationMenuFromLongPress,
			isQuickActionTarget:
				conversationMenu?.layout === "mobile" && conversationMenu?.conversation?._id === conversation._id,
			isPinnedConversation: options.isPinnedConversation === true,
			pinnedOrder: options.pinnedOrder ?? null,
			onPinnedDragStart:
				options.isPinnedConversation === true
					? () => setPinnedDragConversationId(conversation._id)
					: undefined,
			onPinnedDragOver:
				options.isPinnedConversation === true
					? (event) => {
							event.preventDefault();
							event.dataTransfer.dropEffect = "move";
					  }
					: undefined,
			onPinnedDrop:
				options.isPinnedConversation === true
					? (event) => {
							event.preventDefault();
							movePinnedConversation(pinnedDragConversationId, conversation._id);
							setPinnedDragConversationId("");
					  }
					: undefined,
			onPinnedDragEnd:
				options.isPinnedConversation === true
					? () => setPinnedDragConversationId("")
					: undefined,
		}),
		[
			conversationMenu,
			handleOpenConversationMenu,
			handleOpenConversationMenuFromLongPress,
			movePinnedConversation,
			pinnedDragConversationId,
		]
	);

	const pinnedSectionContent =
		visiblePinnedConversations.length > 0 ? (
			<div className='mb-4 rounded-[26px] border border-cyan-300/12 bg-[linear-gradient(180deg,rgba(8,18,38,0.82),rgba(4,10,24,0.9))] p-3 shadow-[0_18px_40px_rgba(2,6,23,0.2)]'>
				<div className='mb-3 flex items-center justify-between gap-3 px-1'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70'>Pinned chats</p>
						<p className='mt-1 text-xs text-slate-400'>Right-click for quick actions. Drag pinned chats to reorder them.</p>
					</div>
					<span className='rounded-full border border-cyan-300/18 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100'>
						{visiblePinnedConversations.length}/4
					</span>
				</div>
				<div className='space-y-2'>
					{visiblePinnedConversations.map((conversation, index) => (
						<Conversation
							key={`pinned-${conversation._id}`}
							conversation={conversation}
							{...getConversationItemProps(conversation, {
								isPinnedConversation: true,
								pinnedOrder: index + 1,
							})}
						/>
					))}
				</div>
			</div>
		) : null;

	const isMobileConversationSelectionMode = conversationMenu?.layout === "mobile";
	const mobileActionConversation = isMobileConversationSelectionMode ? conversationMenu?.conversation : null;
	const mobileToolbarActions = getConversationMenuActions(mobileActionConversation);

	return (
		<aside className='flex h-full min-h-0 w-full flex-col border-r border-white/10 bg-[linear-gradient(180deg,rgba(7,12,25,0.92),rgba(3,8,20,0.84))] p-3 md:w-[390px] lg:w-[430px] lg:p-5 xl:w-[460px]'>
			{isMobileConversationSelectionMode ? (
				<div className='-mx-3 -mt-3 mb-3 border-b border-white/8 bg-[linear-gradient(180deg,rgba(8,15,28,0.98),rgba(6,12,24,0.94))] px-3 pb-2 pt-3 md:hidden'>
					<div className='flex items-center gap-2'>
						<button
							type='button'
							onClick={closeConversationMenu}
							className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-100 transition hover:border-white/18 hover:bg-white/[0.08]'
							aria-label='Close mobile conversation actions'
						>
							<IoArrowBackOutline className='h-5 w-5' />
						</button>
						<span className='min-w-[1.5rem] text-lg font-semibold text-white'>1</span>
						<div className='ml-auto flex items-center gap-1'>
							{mobileToolbarActions.map((action) => {
								const ActionIcon = action.icon;

								return (
									<button
										key={action.label}
										type='button'
										onClick={() => {
											action.onClick();
											closeConversationMenu();
										}}
										className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-100 transition hover:border-cyan-300/20 hover:bg-cyan-400/[0.08]'
										title={action.label}
										aria-label={action.label}
									>
										<ActionIcon className={`h-5 w-5 ${action.iconClassName}`} />
									</button>
								);
							})}
						</div>
					</div>
					<div className='mt-2 px-1'>
						<p className='truncate text-sm font-semibold text-slate-100'>{mobileActionConversation?.fullName}</p>
						<p className='mt-0.5 truncate text-xs text-slate-400'>
							{mobileActionConversation?.type === "GROUP"
								? mobileActionConversation?.isPrivate
									? "Private group selected"
									: "Public group selected"
								: `@${mobileActionConversation?.username}`}
						</p>
					</div>
				</div>
			) : (
				<div className='sidebar-mobile-collapsible'>
					<div className='mb-2'>
						<div className='flex items-start justify-between gap-4'>
							<p className='pt-1 text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300/70'>Chat Space</p>
							<div className='flex items-center gap-2'>
								<div className='rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100'>
									{directFriendConversations.length} friends
								</div>
								<div className='rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200'>
									{onlineCount} online
								</div>
							</div>
						</div>
					</div>

					<StoriesBar
						storyGroups={storyGroups}
						ownStoryGroup={ownStoryGroup}
						loading={loadingStories}
						isCreatingStory={creatingStory}
						authUser={authUser}
						onAddStory={handleOpenStoryComposer}
						onOpenStory={handleOpenStoryViewer}
					/>

					<div
						ref={filterRowRef}
						{...filterRowDragScrollProps}
						className={`sidebar-filter-row mt-3 flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden pb-1 sm:gap-2 ${
							isDraggingFilterRow ? "sidebar-filter-row--dragging" : ""
						}`}
					>
						{FILTERS.map((filter) => {
							const isActive = activeFilter === filter.id;
							const countLabel =
								filter.id === "archived" && archivedCount > 0
									? archivedCount > 99
										? "99+"
										: String(archivedCount)
									: null;

							return (
								<button
									key={filter.id}
									type='button'
									onClick={() => setActiveFilter(filter.id)}
									className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold sm:px-4 sm:py-2 sm:text-xs ${
										isActive
											? "bg-sky-500 text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)]"
											: "border border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
									}`}
								>
									<span>{filter.label}</span>
									{countLabel ? (
										<span className='inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full border border-white/10 bg-white/[0.08] px-1 text-[9px] font-bold leading-none text-inherit'>
											{countLabel}
										</span>
									) : null}
								</button>
							);
						})}
						<button
							type='button'
							onClick={handleOpenCreateGroupModal}
							className='inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 hover:border-cyan-300/35 hover:bg-cyan-500/16 sm:gap-2 sm:px-4 sm:py-2 sm:text-xs'
						>
							<HiOutlineUserGroup className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
							<span>New group</span>
						</button>
						<button
							type='button'
							onClick={handleOpenJoinGroupLinkModal}
							className='inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:border-emerald-300/35 hover:bg-emerald-500/16 sm:gap-2 sm:px-4 sm:py-2 sm:text-xs'
						>
							<HiOutlineLink className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
							<span>Join via link</span>
						</button>
						<button
							type='button'
							onClick={handleOpenDirectInviteModal}
							className='inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 hover:border-amber-300/35 hover:bg-amber-500/16 sm:gap-2 sm:px-4 sm:py-2 sm:text-xs'
						>
							<HiOutlineUserPlus className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
							<span>Invite</span>
						</button>
						<button
							type='button'
							onClick={() => setShowInvitationsPanel((currentValue) => !currentValue)}
							className='inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold text-sky-100 hover:border-sky-300/35 hover:bg-sky-500/16 sm:gap-2 sm:px-4 sm:py-2 sm:text-xs'
							aria-expanded={showInvitationsPanel}
						>
							<span>Invitations</span>
							<span className='rounded-full border border-sky-300/30 bg-sky-500/16 px-2 py-0.5 text-[10px] leading-none'>
								{incomingInvitations.length}
							</span>
						</button>
					</div>

					{showInvitationsPanel ? (
						<DirectInvitationsPanel
							friends={directFriendConversations}
							onOpenFriend={handleOpenFriendConversation}
							incomingInvitations={incomingInvitations}
							outgoingInvitations={outgoingInvitations}
							onRespond={respondInvitation}
							isRespondingToInvitation={isRespondingToInvitation}
						/>
					) : null}
				</div>
			)}

			<div className='sidebar-mobile-heading mb-2.5 mt-4 flex items-center justify-between gap-3'>
				<p className='text-xs font-semibold uppercase tracking-[0.28em] text-slate-500'>
					{isMobileConversationSelectionMode
						? "Selected conversation"
						: activeFilter === "calls"
							? "Calls"
							: "Recent chats"}
				</p>
				<p className='text-xs text-slate-500'>
					{isMobileConversationSelectionMode
						? mobileActionConversation?.fullName || "1 selected"
						: `${activeFilter === "calls" ? filteredCalls.length : filteredConversations.length} visible`}
				</p>
			</div>

			{activeFilter === "calls" ? (
				<CallDirectory
					loading={loadingCalls}
					calls={filteredCalls}
					emptyTitle={emptyTitle}
					emptyDescription={emptyDescription}
					onOpenConversation={handleOpenCallConversation}
				/>
			) : (
				<Conversations
					loading={loading}
					conversations={regularFilteredConversations}
					emptyTitle={emptyTitle}
					emptyDescription={emptyDescription}
					leadingContent={pinnedSectionContent}
					showEmptyState={visiblePinnedConversations.length === 0}
					getConversationProps={(conversation) => getConversationItemProps(conversation)}
				/>
			)}

			{!isMobileConversationSelectionMode ? (
				<div className='sidebar-mobile-bottom relative sticky bottom-0 z-20 mt-3 bg-[linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.92)_24%,rgba(2,6,23,0.97))] pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 md:relative md:bottom-auto md:z-20 md:bg-transparent md:pb-0 md:pt-0'>
				<BroadcastInboxPanel
					open={showBroadcastInbox}
					unreadCount={unreadBroadcastCount}
					announcements={broadcastAnnouncements}
					onClose={() => setShowBroadcastInbox(false)}
					onDismiss={dismissBroadcast}
					onClear={clearBroadcasts}
				/>
				<div className='flex items-center gap-2.5'>
					<div className='min-w-0 flex-1'>
						<SearchInput
							value={searchValue}
							onChange={setSearchValue}
							onClear={handleClearSearch}
							totalCount={activeFilter === "calls" ? calls.length : conversations.length}
							visibleCount={activeFilter === "calls" ? filteredCalls.length : filteredConversations.length}
							activeFilter={activeFilter}
							showSummary={false}
							compact
						/>
					</div>
					<div className='shrink-0'>
						<button
							type='button'
							onClick={handleToggleBroadcastInbox}
							aria-expanded={showBroadcastInbox}
							aria-label={showBroadcastInbox ? "Hide announcements" : "Show announcements"}
							title={showBroadcastInbox ? "Hide announcements" : "Show announcements"}
							className='relative inline-flex shrink-0 items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100 hover:border-cyan-300/35 hover:bg-cyan-500/16 sm:px-4'
						>
							<IoNotificationsOutline className='h-4 w-4' />
							<span className='hidden sm:inline'>Alerts</span>
							{unreadBroadcastCount > 0 ? (
								<span className='absolute -right-1 -top-1 inline-flex min-h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full border border-amber-200/40 bg-amber-400 px-1 text-[10px] font-bold text-slate-950 shadow-[0_8px_16px_rgba(251,191,36,0.3)]'>
									{unreadBroadcastCount > 9 ? "9+" : unreadBroadcastCount}
								</span>
							) : null}
						</button>
					</div>
					<button
						type='button'
						onClick={() =>
							startTransition(() => {
								setShowBroadcastInbox(false);
								setShowQuickActions((currentValue) => !currentValue);
							})
						}
						aria-expanded={showQuickActions}
						aria-label={showQuickActions ? "Hide quick actions" : "Show quick actions"}
						title={showQuickActions ? "Hide quick actions" : "Show quick actions"}
						className='inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100 hover:border-sky-300/35 hover:bg-sky-500/16'
					>
						<IoCodeSlashOutline className='h-4 w-4' />
						<span>{isDeveloper ? "Tools" : "Menu"}</span>
						{showQuickActions ? (
							<IoChevronUpOutline className='h-4 w-4' />
						) : (
							<IoChevronDownOutline className='h-4 w-4' />
						)}
					</button>
				</div>

				{showQuickActions ? (
					<div className='mt-3'>
						<div className='space-y-3 rounded-[28px] border border-white/10 bg-white/[0.025] p-3'>
							{isDeveloper ? (
								<Link
									to='/developer'
									className='group flex items-center justify-between gap-3 rounded-[24px] border border-sky-400/20 bg-sky-500/10 p-3 text-left transition-colors hover:border-sky-300/35 hover:bg-sky-500/14'
								>
									<div className='flex min-w-0 items-center gap-3'>
										<div className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200'>
											<IoCodeSlashOutline className='h-5 w-5' />
										</div>
										<div className='min-w-0'>
											<p className='truncate text-sm font-semibold text-white'>Developer Console</p>
											<p className='mt-1 truncate text-xs text-sky-100/80'>
												Moderate users, messages, and roles
											</p>
										</div>
									</div>
									<span className='rounded-full border border-sky-300/20 bg-sky-400/12 px-3 py-1 text-[11px] font-medium text-sky-100'>
										Open
									</span>
								</Link>
							) : null}
							<ProfileButton />
							<LogoutButton />
						</div>
					</div>
				) : null}
				</div>
			) : null}

			<CreateGroupModal
				open={showCreateGroupModal}
				onClose={() => setShowCreateGroupModal(false)}
				onCreated={(conversation) => {
					window.dispatchEvent(
						new CustomEvent("chat:conversation-restored", {
							detail: { conversation },
						})
					);
					setSelectedConversation(conversation);
					setShowSidebar(false);
				}}
			/>

			<DirectInviteModal
				open={showDirectInviteModal}
				onClose={() => setShowDirectInviteModal(false)}
				onSendInvitation={sendInvitation}
				isSendingToUser={isSendingToUser}
				connectedUserIds={directConnectedUserIds}
				pendingCounterpartIds={pendingCounterpartIds}
			/>

			<JoinGroupLinkModal
				open={showJoinGroupLinkModal}
				onClose={() => setShowJoinGroupLinkModal(false)}
				onJoin={handleJoinGroupByInviteLink}
			/>

			<StoryComposerModal
				open={showStoryComposer}
				onClose={() => setShowStoryComposer(false)}
				onSubmit={handleCreateStory}
				isSubmitting={creatingStory}
			/>

			<StoryViewerModal
				open={showStoryViewer}
				storyGroups={resolvedStoryGroups}
				initialTarget={storyViewerTarget}
				authUserId={authUser?._id || authUser?.id || null}
				onClose={() => {
					setShowStoryViewer(false);
					setStoryViewerTarget(null);
					setStoryViewerGroupsOverride(null);
				}}
				onSeen={markStoryAsSeen}
				onDelete={deleteStory}
				onGetViewers={getStoryViewers}
				onReact={reactToStory}
				onComment={commentOnStory}
			/>

			{deleteConversationDialog
				? createPortal(
					<div
						className='fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/76 px-4 backdrop-blur-sm'
						onClick={closeDeleteConversationDialog}
					>
						<div
							className='w-full max-w-md rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,19,35,0.98),rgba(6,11,23,0.98))] p-6 shadow-[0_26px_72px_rgba(2,6,23,0.45)]'
							onClick={(event) => event.stopPropagation()}
						>
							<div className='inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-500/12 text-rose-100'>
								<IoTrashOutline className='h-5 w-5' />
							</div>
							<h3 className='mt-4 text-xl font-semibold text-white'>Delete conversation?</h3>
							<p className='mt-3 text-sm leading-6 text-slate-300'>
								This will remove{" "}
								<span className='font-semibold text-white'>{deleteConversationDialog.fullName}</span> from your
								conversation list.
							</p>
							<div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end'>
								<button
									type='button'
									className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
									onClick={closeDeleteConversationDialog}
									disabled={isDeletingConversation}
								>
									Cancel
								</button>
								<button
									type='button'
									className='rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60'
									onClick={handleDeleteConversation}
									disabled={isDeletingConversation}
								>
									{isDeletingConversation ? "Deleting..." : "Delete chat"}
								</button>
							</div>
						</div>
					</div>,
					document.body
				  )
				: null}

			{conversationMenu && conversationMenu.layout !== "mobile"
				? createPortal(
					(() => {
						const activeConversation = conversationMenu.conversation;
						const menuActions = getConversationMenuActions(activeConversation);

						return (
							<div
								className='fixed inset-0 z-[140] bg-slate-950/36 backdrop-blur-[2px]'
								onClick={closeConversationMenu}
								onContextMenu={(event) => {
									event.preventDefault();
									closeConversationMenu();
								}}
							>
								<div
									ref={conversationMenuPanelRef}
									className='fixed z-[141] flex max-h-[calc(100vh-24px)] w-[288px] flex-col overflow-hidden rounded-[26px] border border-sky-200/10 bg-[#08101d] p-2 shadow-[0_32px_72px_rgba(2,6,23,0.72)] ring-1 ring-cyan-200/8'
									style={{ top: `${conversationMenu.top}px`, left: `${conversationMenu.left}px` }}
									onClick={(event) => event.stopPropagation()}
									onContextMenu={(event) => event.preventDefault()}
								>
									<div className='rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,26,46,0.98),rgba(8,15,27,1))] px-4 py-3.5'>
										<div className='flex items-start justify-between gap-3'>
											<div className='min-w-0'>
												<p className='text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-200/78'>
													Conversation menu
												</p>
												<p className='mt-2 truncate text-base font-semibold text-white'>
													{activeConversation.fullName}
												</p>
												<p className='mt-1 truncate text-xs text-slate-300/78'>
													{activeConversation.type === "GROUP"
														? activeConversation.isPrivate
															? "Private group"
															: "Public group"
														: `@${activeConversation.username}`}
												</p>
											</div>
											<span className='shrink-0 rounded-full border border-cyan-300/22 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100'>
												Quick
											</span>
										</div>
									</div>

									<div className='min-h-0 flex-1 px-1 pb-1 pt-3'>
										<div className='h-full space-y-2 overflow-y-auto overscroll-contain pr-1'>
											{menuActions.map((action) => {
												const ActionIcon = action.icon;

												return (
													<button
														key={action.label}
														type='button'
														onClick={() => {
															action.onClick();
															closeConversationMenu();
														}}
														className='flex w-full items-start gap-3 rounded-[20px] border border-white/7 bg-white/[0.028] px-3.5 py-3 text-left transition hover:border-cyan-300/18 hover:bg-cyan-400/[0.08]'
													>
														<div className='mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-slate-900/90'>
															<ActionIcon className={`h-4.5 w-4.5 ${action.iconClassName}`} />
														</div>
														<div className='min-w-0'>
															<p className='text-sm font-semibold text-slate-50'>{action.label}</p>
															<p className='mt-1 text-xs leading-5 text-slate-300/72'>{action.description}</p>
														</div>
													</button>
												);
											})}
										</div>
									</div>
								</div>
							</div>
						);
					})(),
					document.body
				  )
				: null}
		</aside>
	);
};

export default Sidebar;
