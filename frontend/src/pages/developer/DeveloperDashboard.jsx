import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
	IoArrowBack,
	IoCameraOutline,
	IoCodeSlashOutline,
	IoKeyOutline,
	IoPersonOutline,
	IoRefreshOutline,
	IoSparklesOutline,
} from "react-icons/io5";
import DeveloperAuditLogsPage from "../../components/developer/DeveloperAuditLogsPage";
import DeveloperAnalyticsPage from "../../components/developer/DeveloperAnalyticsPage";
import DeveloperGroupInspectorModal from "../../components/developer/DeveloperGroupInspectorModal";
import DeveloperGroupsPage from "../../components/developer/DeveloperGroupsPage";
import DeveloperReportsPage from "../../components/developer/DeveloperReportsPage";
import DeveloperUsersPage from "../../components/developer/DeveloperUsersPage";
import {
	developerPermissionDefinitions,
	developerSections,
	fetchDeveloperJson,
	hasDeveloperPermission,
} from "../../components/developer/developerDashboardShared";
import { useAuthContext } from "../../context/AuthContext";
import { useSocketContext } from "../../context/SocketContext";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const getDeveloperSection = (pathname) => {
	if (pathname.startsWith("/developer/users")) return "users";
	if (pathname.startsWith("/developer/groups")) return "groups";
	if (pathname.startsWith("/developer/reports")) return "reports";
	if (pathname.startsWith("/developer/audit")) return "audit";
	if (pathname.startsWith("/developer/analytics")) return "analytics";
	return null;
};

const createEditUserDraft = (user) => ({
	fullName: user?.fullName || "",
	username: user?.username || "",
	gender: user?.gender || "male",
	bio: user?.bio || "",
	newPassword: "",
	confirmPassword: "",
	profilePicFile: null,
	profilePicPreviewUrl: "",
});

const DeveloperDashboard = () => {
	const { authUser } = useAuthContext();
	const { socket } = useSocketContext();
	const location = useLocation();
	const activeSection = getDeveloperSection(location.pathname);

	const [overview, setOverview] = useState({
		totals: {
			totalUsers: 0,
			developerCount: 0,
			archivedCount: 0,
			bannedCount: 0,
			conversationCount: 0,
			messageCount: 0,
			newUsersThisWeek: 0,
		},
		latestUsers: [],
	});
	const [users, setUsers] = useState([]);
	const [groups, setGroups] = useState([]);
	const [reports, setReports] = useState([]);
	const [auditLogs, setAuditLogs] = useState([]);
	const [searchValue, setSearchValue] = useState("");
	const [groupSearchValue, setGroupSearchValue] = useState("");
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [groupDetailsLoading, setGroupDetailsLoading] = useState(false);
	const [actionKey, setActionKey] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [modalState, setModalState] = useState(null);
	const [confirmState, setConfirmState] = useState(null);
	const [selectedGroupId, setSelectedGroupId] = useState("");
	const [selectedGroupDetails, setSelectedGroupDetails] = useState(null);

	const loadDashboard = async ({ silent = false } = {}) => {
		if (silent) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		try {
			setErrorMessage("");
			const [overviewData, usersData, groupsData, reportsData, auditLogsData] = await Promise.all([
				fetchDeveloperJson("/api/developer/overview"),
				fetchDeveloperJson("/api/developer/users"),
				fetchDeveloperJson("/api/developer/groups"),
				fetchDeveloperJson("/api/developer/reports"),
				fetchDeveloperJson("/api/developer/audit-logs"),
			]);

			setOverview(overviewData);
			setUsers(usersData);
			setGroups(groupsData);
			setReports(reportsData);
			setAuditLogs(auditLogsData);
		} catch (error) {
			setErrorMessage(error.message || "Unable to load developer dashboard");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	useEffect(() => {
		loadDashboard();
	}, []);

	useEffect(() => {
		const applyBodyScrollMode = () => {
			const root = document.documentElement;
			const body = document.body;

			if (window.innerWidth < 1280) {
				root.style.height = "auto";
				root.style.overflowY = "auto";
				root.style.overflowX = "hidden";
				body.style.height = "auto";
				body.style.minHeight = "100dvh";
				body.style.overflowY = "auto";
				body.style.overflowX = "hidden";
				return;
			}

			root.style.height = "100%";
			root.style.overflow = "hidden";
			body.style.height = "";
			body.style.minHeight = "";
			body.style.overflow = "hidden";
		};

		applyBodyScrollMode();
		window.addEventListener("resize", applyBodyScrollMode);

		return () => {
			window.removeEventListener("resize", applyBodyScrollMode);
			document.documentElement.style.height = "";
			document.documentElement.style.overflow = "";
			document.documentElement.style.overflowX = "";
			document.documentElement.style.overflowY = "";
			document.body.style.height = "";
			document.body.style.minHeight = "";
			document.body.style.overflow = "";
			document.body.style.overflowX = "";
			document.body.style.overflowY = "";
		};
	}, []);

	useEffect(() => {
		if (!modalState && !confirmState && !selectedGroupId) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape" && !actionKey) {
				if (confirmState) {
					setConfirmState(null);
					return;
				}
				if (selectedGroupId) {
					setSelectedGroupId("");
					setSelectedGroupDetails(null);
					return;
				}
				setModalState(null);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [actionKey, confirmState, modalState, selectedGroupId]);

	useEffect(() => {
		const previewUrl =
			modalState?.type === "edit-user" ? modalState?.draft?.profilePicPreviewUrl || "" : "";
		if (!previewUrl || !previewUrl.startsWith("blob:")) {
			return undefined;
		}

		return () => {
			URL.revokeObjectURL(previewUrl);
		};
	}, [modalState]);

	useEffect(() => {
		if (!selectedGroupId) return;
		if (groups.some((group) => group._id === selectedGroupId)) return;
		setSelectedGroupId("");
		setSelectedGroupDetails(null);
	}, [groups, selectedGroupId]);

	const filteredUsers = useMemo(() => {
		const normalizedQuery = searchValue.trim().toLowerCase();
		if (!normalizedQuery) return users;

		return users.filter((user) =>
			[
				user.fullName,
				user.username,
				user.role,
				user.bio,
				user.bannedReason,
				user.isBanned ? "banned" : "active",
				user.isArchived ? "archived" : "live",
				user.isVerified ? "verified" : "standard",
			]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedQuery))
		);
	}, [searchValue, users]);

	const filteredGroups = useMemo(() => {
		const normalizedQuery = groupSearchValue.trim().toLowerCase();
		if (!normalizedQuery) return groups;

		return groups.filter((group) =>
			[
				group.title,
				group.description,
				group.isPrivate ? "private" : "public",
				group.owner?.fullName,
				group.owner?.username,
				...(group.members || []).flatMap((member) => [member.fullName, member.username]),
			]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedQuery))
		);
	}, [groupSearchValue, groups]);

	const groupTotals = useMemo(
		() => ({
			total: groups.length,
			publicCount: groups.filter((group) => !group.isPrivate).length,
			privateCount: groups.filter((group) => group.isPrivate).length,
		}),
		[groups]
	);
	const canManageUsers = hasDeveloperPermission(authUser, "manageUsers");
	const canEditUserData = hasDeveloperPermission(authUser, "editUserData");
	const canManageGroups = hasDeveloperPermission(authUser, "manageGroups");
	const canManageReports = hasDeveloperPermission(authUser, "manageReports");
	const canDeleteGroups = hasDeveloperPermission(authUser, "deleteGroups");
	const canDeleteMessages = hasDeveloperPermission(authUser, "deleteMessages");
	const canDeleteReports = hasDeveloperPermission(authUser, "deleteReports");
	const canManageDeveloperPermissions = Boolean(authUser?.isPrimaryDeveloper);

	const handleRefresh = async () => {
		await loadDashboard({ silent: true });
		if (selectedGroupId) {
			await loadGroupDetails(selectedGroupId, { silent: true });
		}
	};

	const handleRoleChange = async (user, nextRole) => {
		setActionKey(`role-${user._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/users/${user._id}/role`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: nextRole }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const handleArchiveToggle = async (user, shouldArchive) => {
		setActionKey(`archive-user-${user._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/users/${user._id}/archive`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isArchived: shouldArchive }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleBanToggle = async (user, shouldBan, reason = "") => {
		setActionKey(`ban-${user._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/users/${user._id}/ban`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isBanned: shouldBan, reason }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleVerificationToggle = async (user, shouldVerify) => {
		setActionKey(`verify-${user._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/users/${user._id}/verify`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isVerified: shouldVerify }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const loadGroupDetails = async (groupId, { silent = false } = {}) => {
		if (!groupId) return null;

		if (!silent) {
			setSelectedGroupId(groupId);
			setSelectedGroupDetails(null);
			setGroupDetailsLoading(true);
		}

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${groupId}`);
			setSelectedGroupId(groupId);
			setSelectedGroupDetails(data);
			return data;
		} catch (error) {
			toast.error(error.message);
			if (!silent) {
				setSelectedGroupId("");
				setSelectedGroupDetails(null);
			}
			return null;
		} finally {
			setGroupDetailsLoading(false);
		}
	};

	const handleInspectGroup = async (group) => {
		await loadGroupDetails(group._id);
	};

	useEffect(() => {
		if (!socket) return undefined;

		let refreshTimeoutId = null;
		const handleWorkspaceRefresh = () => {
			if (refreshTimeoutId) {
				window.clearTimeout(refreshTimeoutId);
			}

			refreshTimeoutId = window.setTimeout(() => {
				void loadDashboard({ silent: true });
				if (selectedGroupId) {
					void loadGroupDetails(selectedGroupId, { silent: true });
				}
			}, 140);
		};

		socket.on("developerWorkspaceRefresh", handleWorkspaceRefresh);
		return () => {
			if (refreshTimeoutId) {
				window.clearTimeout(refreshTimeoutId);
			}
			socket.off("developerWorkspaceRefresh", handleWorkspaceRefresh);
		};
	}, [loadDashboard, loadGroupDetails, selectedGroupId, socket]);

	const handleDeleteGroup = async (group) => {
		if (!group || actionKey) return;

		setActionKey(`delete-group-${group._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${group._id}`, {
				method: "DELETE",
			});

			if (selectedGroupId === group._id) {
				setSelectedGroupId("");
				setSelectedGroupDetails(null);
			}

			await loadDashboard({ silent: true });
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const handleDeleteGroupMessage = async (groupId, message) => {
		if (!groupId || !message || actionKey) return;

		setActionKey(`delete-group-message-${message._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${groupId}/messages/${message._id}`, {
				method: "DELETE",
			});

			await Promise.all([loadDashboard({ silent: true }), loadGroupDetails(groupId, { silent: true })]);
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const handleDeleteReport = async (report) => {
		if (!report?._id || actionKey) return;

		setActionKey(`delete-report-${report._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/reports/${report._id}`, {
				method: "DELETE",
			});

			setReports((currentReports) => currentReports.filter((currentReport) => currentReport._id !== report._id));
			await loadDashboard({ silent: true });
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const handleCreateReport = async (payload) => {
		setActionKey("create-report");

		try {
			const data = await fetchDeveloperJson("/api/developer/reports", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleUpdateReport = async (report, payload) => {
		if (!report?._id) return false;

		setActionKey(`report-status-${report._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/reports/${report._id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			setReports((currentReports) =>
				currentReports.map((currentReport) =>
					currentReport._id === report._id ? data.report : currentReport
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleSaveGroupSettings = async (groupId, payload) => {
		if (!groupId) return false;

		setActionKey(`save-group-settings-${groupId}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${groupId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			setSelectedGroupDetails(data);
			await loadDashboard({ silent: true });
			toast.success("Group settings updated");
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleAddGroupMembersAsDeveloper = async (groupId, memberIds) => {
		if (!groupId || !Array.isArray(memberIds) || memberIds.length === 0) return false;

		setActionKey(`add-group-member-${groupId}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${groupId}/members`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ memberIds }),
			});

			setSelectedGroupDetails(data);
			await loadDashboard({ silent: true });
			toast.success("Member added to group");
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleUpdateGroupMemberRoleAsDeveloper = async (groupId, memberId, role) => {
		if (!groupId || !memberId || !role) return false;

		setActionKey(`update-group-role-${groupId}-${memberId}-${role}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${groupId}/members/${memberId}/role`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role }),
			});

			setSelectedGroupDetails(data);
			await loadDashboard({ silent: true });
			toast.success("Member role updated");
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleRemoveGroupMemberAsDeveloper = async (groupId, member) => {
		if (!groupId || !member?._id) return false;

		setActionKey(`remove-group-member-${groupId}-${member._id}`);

		try {
			const data = await fetchDeveloperJson(`/api/developer/groups/${groupId}/members/${member._id}`, {
				method: "DELETE",
			});

			setSelectedGroupDetails(data);
			await loadDashboard({ silent: true });
			toast.success("Member removed from group");
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const openDeleteGroupPopup = (group) => {
		if (!group || actionKey) return;
		setConfirmState({
			type: "delete-group",
			group,
		});
	};

	const openDeleteGroupMessagePopup = (groupId, message) => {
		if (!groupId || !message || actionKey) return;
		setConfirmState({
			type: "delete-group-message",
			groupId,
			message,
		});
	};

	const openDeleteReportPopup = (report) => {
		if (!report || actionKey) return;
		setConfirmState({
			type: "delete-report",
			report,
		});
	};

	const closeConfirmPopup = () => {
		if (actionKey) return;
		setConfirmState(null);
	};

	const handleConfirmAction = async () => {
		if (!confirmState) return;

		if (confirmState.type === "delete-group") {
			await handleDeleteGroup(confirmState.group);
			setConfirmState(null);
			return;
		}

		if (confirmState.type === "delete-group-message") {
			await handleDeleteGroupMessage(confirmState.groupId, confirmState.message);
			setConfirmState(null);
			return;
		}

		if (confirmState.type === "delete-report") {
			await handleDeleteReport(confirmState.report);
			setConfirmState(null);
		}
	};

	const closeGroupInspector = () => {
		if (actionKey) return;
		setSelectedGroupId("");
		setSelectedGroupDetails(null);
	};

	const openArchiveModal = (user) => {
		setModalState({
			type: "archive-user",
			user,
			shouldArchive: !user.isArchived,
		});
	};

	const openBanModal = (user) => {
		setModalState({
			type: "ban-user",
			user,
			shouldBan: !user.isBanned,
			reason: user.bannedReason || "",
		});
	};

	const openEditUserModal = (user) => {
		if (!user || actionKey) return;
		setModalState({
			type: "edit-user",
			user,
			draft: createEditUserDraft(user),
		});
	};

	const openDeveloperPermissionsModal = (user) => {
		if (!user || actionKey) return;
		setModalState({
			type: "developer-permissions",
			user,
			permissions: {
				fullAccess: Boolean(user.developerPermissions?.fullAccess),
				manageUsers: Boolean(user.developerPermissions?.manageUsers),
				editUserData: Boolean(user.developerPermissions?.editUserData),
				manageGroups: Boolean(user.developerPermissions?.manageGroups),
				manageReports: Boolean(user.developerPermissions?.manageReports),
				deleteGroups: Boolean(user.developerPermissions?.deleteGroups),
				deleteMessages: Boolean(user.developerPermissions?.deleteMessages),
				deleteReports: Boolean(user.developerPermissions?.deleteReports),
			},
		});
	};

	const closeModal = () => {
		if (actionKey) return;
		setModalState(null);
	};

	const updateModalReason = (value) => {
		setModalState((currentModal) =>
			currentModal?.type === "ban-user"
				? {
						...currentModal,
						reason: value,
				  }
				: currentModal
		);
	};

	const updatePermissionsDraft = (permissionKey, nextValue) => {
		setModalState((currentModal) =>
			currentModal?.type === "developer-permissions"
				? {
						...currentModal,
						permissions: {
							...currentModal.permissions,
							[permissionKey]: nextValue,
						},
				  }
				: currentModal
		);
	};

	const updateEditUserDraft = (field, value) => {
		setModalState((currentModal) =>
			currentModal?.type === "edit-user"
				? {
						...currentModal,
						draft: {
							...currentModal.draft,
							[field]: value,
						},
				  }
				: currentModal
		);
	};

	const updateEditUserProfilePic = (file) => {
		setModalState((currentModal) => {
			if (currentModal?.type !== "edit-user") {
				return currentModal;
			}

			return {
				...currentModal,
				draft: {
					...currentModal.draft,
					profilePicFile: file || null,
					profilePicPreviewUrl: file ? URL.createObjectURL(file) : "",
				},
			};
		});
	};

	const handleModalConfirm = async () => {
		if (!modalState) return;

		let succeeded = false;

		if (modalState.type === "archive-user") {
			succeeded = await handleArchiveToggle(modalState.user, modalState.shouldArchive);
		}

		if (modalState.type === "ban-user") {
			succeeded = await handleBanToggle(
				modalState.user,
				modalState.shouldBan,
				(modalState.reason || "").trim()
			);
		}

		if (modalState.type === "developer-permissions") {
			setActionKey(`developer-permissions-${modalState.user._id}`);

			try {
				const data = await fetchDeveloperJson(`/api/developer/users/${modalState.user._id}/permissions`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ permissions: modalState.permissions }),
				});

				setUsers((currentUsers) =>
					currentUsers.map((currentUser) =>
						currentUser._id === modalState.user._id ? { ...currentUser, ...data.user } : currentUser
					)
				);
				await loadDashboard({ silent: true });
				toast.success(data.message);
				succeeded = true;
			} catch (error) {
				toast.error(error.message);
			} finally {
				setActionKey("");
			}
		}

		if (modalState.type === "edit-user") {
			setActionKey(`edit-user-${modalState.user._id}`);

			try {
				const formData = new FormData();
				formData.append("fullName", modalState.draft.fullName || "");
				formData.append("username", modalState.draft.username || "");
				formData.append("gender", modalState.draft.gender || "male");
				formData.append("bio", modalState.draft.bio || "");

				if (modalState.draft.newPassword || modalState.draft.confirmPassword) {
					formData.append("newPassword", modalState.draft.newPassword || "");
					formData.append("confirmPassword", modalState.draft.confirmPassword || "");
				}

				if (modalState.draft.profilePicFile) {
					formData.append("profilePic", modalState.draft.profilePicFile);
				}

				const data = await fetchDeveloperJson(`/api/developer/users/${modalState.user._id}/profile`, {
					method: "PATCH",
					body: formData,
				});

				setUsers((currentUsers) =>
					currentUsers.map((currentUser) =>
						currentUser._id === modalState.user._id ? { ...currentUser, ...data.user } : currentUser
					)
				);
				await loadDashboard({ silent: true });
				toast.success(data.message);
				succeeded = true;
			} catch (error) {
				toast.error(error.message);
			} finally {
				setActionKey("");
			}
		}

		if (succeeded) {
			setModalState(null);
		}
	};

	const modalActionKey =
		modalState?.type === "archive-user"
			? `archive-user-${modalState.user._id}`
			: modalState?.type === "ban-user"
				? `ban-${modalState.user._id}`
				: modalState?.type === "edit-user"
					? `edit-user-${modalState.user._id}`
				: modalState?.type === "developer-permissions"
					? `developer-permissions-${modalState.user._id}`
				: "";
	const isModalBusy = Boolean(modalActionKey && actionKey === modalActionKey);
	const isDeveloperPermissionsModal = modalState?.type === "developer-permissions";
	const isEditUserModal = modalState?.type === "edit-user";
	const isWideModal = isDeveloperPermissionsModal || isEditUserModal;
	const editUserAvatar =
		modalState?.type === "edit-user"
			? modalState.draft?.profilePicPreviewUrl ||
				getAvatarUrl(modalState.user?.profilePic, 144) ||
				getConversationFallbackAvatar(modalState.user)
			: "";
	const confirmActionKey =
		confirmState?.type === "delete-group"
			? `delete-group-${confirmState.group._id}`
			: confirmState?.type === "delete-group-message"
				? `delete-group-message-${confirmState.message._id}`
				: confirmState?.type === "delete-report"
					? `delete-report-${confirmState.report._id}`
				: "";
	const isConfirmBusy = Boolean(confirmActionKey && actionKey === confirmActionKey);

	const sectionMeta = {
		analytics: {
			eyebrow: "Overview",
			title: "Platform analytics",
			description:
				"Read the health of the app through totals, proportions, bars, circles, and signup movement.",
		},
		users: {
			eyebrow: "Moderation",
			title: "User management",
			description: "Handle account roles, archive flows, verification, and abusive behavior from one page.",
		},
		groups: {
			eyebrow: "Spaces",
			title: "Group management",
			description: "Inspect every group, review activity, and moderate group content without opening direct chats.",
		},
		reports: {
			eyebrow: "Incidents",
			title: "Reports desk",
			description: "Track moderation cases, review them by status, and record the action taken on each issue.",
		},
		audit: {
			eyebrow: "Traceability",
			title: "Audit logs",
			description: "Review the full history of developer actions across users, groups, reports, and content moderation.",
		},
	};

	if (location.pathname === "/developer") {
		return <Navigate to='/developer/analytics' replace />;
	}

	if (!activeSection) {
		return <Navigate to='/developer/analytics' replace />;
	}

	return (
		<div className='relative flex min-h-full w-full min-w-0 flex-1 overflow-x-hidden overflow-y-visible xl:h-full xl:min-h-0 xl:overflow-hidden'>
			<div className='pointer-events-none absolute inset-0 overflow-hidden'>
				<div className='absolute left-[-10%] top-[-14%] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl'></div>
				<div className='absolute bottom-[-18%] right-[-10%] h-96 w-96 rounded-full bg-orange-400/10 blur-3xl'></div>
				<div className='absolute left-[48%] top-[26%] h-52 w-52 rounded-full bg-sky-300/8 blur-3xl'></div>
			</div>

			<div className='relative mx-auto flex min-h-full w-full min-w-0 max-w-[1780px] flex-col px-2 py-2 sm:px-4 sm:py-4 lg:px-6 lg:py-6 xl:h-full'>
				<div className='relative flex min-h-full min-w-0 flex-col overflow-visible rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,14,28,0.92),rgba(8,15,30,0.7))] p-2.5 shadow-[0_28px_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl sm:rounded-[28px] sm:p-4 lg:p-5 xl:h-full xl:min-h-0 xl:overflow-hidden'>
					<div className='pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/35 to-transparent'></div>

					<div className='grid min-w-0 gap-3 sm:gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[280px_minmax(0,1fr)]'>
						<aside className='custom-scrollbar hidden min-h-0 flex-col overflow-y-auto overflow-x-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,12,26,0.94),rgba(10,18,34,0.75))] p-5 pr-3 shadow-[0_24px_70px_rgba(2,6,23,0.32)] xl:flex'>
							<div className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-200'>
								<IoCodeSlashOutline className='h-4 w-4' />
								Developer control
							</div>

							<h1 className='mt-5 text-3xl font-semibold tracking-tight text-white'>Control center</h1>
							<p className='mt-3 text-sm leading-7 text-slate-400'>
								Open each workspace on its own page so analytics, users, and groups stay cleaner to operate.
							</p>

							<nav className='mt-8 space-y-2'>
								{developerSections.map(({ id, label, icon: Icon, to }, index) => (
									<NavLink
										key={id}
										to={to}
										className={({ isActive }) =>
											`flex items-center justify-between gap-3 rounded-[22px] border px-4 py-4 transition ${
												isActive
													? "border-sky-300/28 bg-sky-500/12 text-white shadow-[0_16px_36px_rgba(14,165,233,0.12)]"
													: "border-white/8 bg-white/[0.025] text-slate-300 hover:border-white/12 hover:bg-white/[0.04]"
											}`
										}
									>
										<div className='flex items-center gap-3'>
											<div className='inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]'>
												<Icon className='h-5 w-5' />
											</div>
											<div>
												<p className='text-sm font-semibold'>{label}</p>
												<p className='mt-1 text-xs text-slate-500'>
													{id === "analytics"
														? "Charts and totals"
														: id === "users"
															? "Roles and moderation"
															: id === "groups"
																? "Group activity"
																: id === "reports"
																	? "Cases and review"
																	: "Action history"}
												</p>
											</div>
										</div>
										<span className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
											{String(index + 1).padStart(2, "0")}
										</span>
									</NavLink>
								))}
							</nav>

							<div className='mt-8 rounded-[26px] border border-white/10 bg-white/[0.03] p-4'>
								<p className='text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500'>Snapshot</p>
								<div className='mt-4 grid grid-cols-2 gap-3'>
									<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
										<p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Users</p>
										<p className='mt-2 text-xl font-semibold text-white'>{overview.totals.totalUsers}</p>
									</div>
									<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
										<p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Groups</p>
										<p className='mt-2 text-xl font-semibold text-white'>{groups.length}</p>
									</div>
									<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
										<p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Verified</p>
										<p className='mt-2 text-xl font-semibold text-white'>
											{users.filter((user) => user.isVerified).length}
										</p>
									</div>
									<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
										<p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Public</p>
										<p className='mt-2 text-xl font-semibold text-white'>{groupTotals.publicCount}</p>
									</div>
								</div>
							</div>

							<div className='mt-8 rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(59,130,246,0.06))] p-4 xl:mt-auto'>
								<div className='flex items-center gap-3'>
									<div className='inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100'>
										<IoSparklesOutline className='h-5 w-5' />
									</div>
									<div>
										<p className='text-sm font-semibold text-white'>Signed in as {authUser?.fullName}</p>
										<p className='mt-1 text-xs text-slate-400'>Developer console session is active.</p>
									</div>
								</div>
							</div>
						</aside>

						<div className='flex min-w-0 flex-col overflow-visible xl:min-h-0 xl:overflow-hidden'>
							<div className='order-2 xl:hidden xl:order-none'>
								<div className='rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,12,26,0.94),rgba(10,18,34,0.75))] p-3.5 shadow-[0_20px_56px_rgba(2,6,23,0.28)] sm:rounded-[28px] sm:p-4'>
									<div className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-200'>
										<IoCodeSlashOutline className='h-3.5 w-3.5' />
										Developer control
									</div>

									<div className='mt-4 flex items-start justify-between gap-3'>
										<div>
											<p className='text-xl font-semibold text-white'>Control center</p>
											<p className='mt-1 text-xs leading-6 text-slate-400'>
												Fast access to analytics, users, and groups.
											</p>
										</div>
										<div className='rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right'>
											<p className='text-[10px] uppercase tracking-[0.2em] text-slate-500'>Live</p>
											<p className='mt-1 text-sm font-semibold text-white'>{overview.totals.totalUsers}</p>
										</div>
									</div>

									<div className='mt-4 grid grid-cols-3 gap-2'>
										{developerSections.map(({ id, label, icon: Icon, to }, index) => (
											<NavLink
												key={id}
												to={to}
												className={({ isActive }) =>
													`min-w-0 rounded-[20px] border px-2.5 py-3 text-center transition ${
														isActive
															? "border-sky-300/28 bg-sky-500/12 text-white"
															: "border-white/8 bg-white/[0.025] text-slate-300"
													}`
												}
											>
												<div className='mx-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]'>
													<Icon className='h-4.5 w-4.5' />
												</div>
												<p className='mt-2 break-words text-[11px] font-semibold leading-5'>{label}</p>
												<p className='mt-1 text-[10px] text-slate-500'>{String(index + 1).padStart(2, "0")}</p>
											</NavLink>
										))}
									</div>

									<div className='mt-4 grid grid-cols-2 gap-2'>
										<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
											<p className='text-[10px] uppercase tracking-[0.2em] text-slate-500'>Users</p>
											<p className='mt-2 text-lg font-semibold text-white'>{overview.totals.totalUsers}</p>
										</div>
										<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
											<p className='text-[10px] uppercase tracking-[0.2em] text-slate-500'>Groups</p>
											<p className='mt-2 text-lg font-semibold text-white'>{groups.length}</p>
										</div>
										<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
											<p className='text-[10px] uppercase tracking-[0.2em] text-slate-500'>Verified</p>
											<p className='mt-2 text-lg font-semibold text-white'>
												{users.filter((user) => user.isVerified).length}
											</p>
										</div>
										<div className='rounded-[18px] border border-white/8 bg-slate-950/35 px-3 py-3'>
											<p className='text-[10px] uppercase tracking-[0.2em] text-slate-500'>Public</p>
											<p className='mt-2 text-lg font-semibold text-white'>{groupTotals.publicCount}</p>
										</div>
									</div>

									<div className='mt-4 rounded-[22px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(59,130,246,0.06))] p-4'>
										<div className='flex items-center gap-3'>
											<div className='inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100'>
												<IoSparklesOutline className='h-4.5 w-4.5' />
											</div>
											<div className='min-w-0'>
												<p className='truncate text-sm font-semibold text-white'>Signed in as {authUser?.fullName}</p>
												<p className='mt-1 text-xs text-slate-400'>Developer console session is active.</p>
											</div>
										</div>
									</div>
								</div>
							</div>

							<div className='order-1 mt-3 min-w-0 rounded-[24px] border border-white/10 bg-white/[0.03] px-3.5 py-4 shadow-[0_20px_42px_rgba(2,6,23,0.22)] backdrop-blur-xl sm:mt-4 sm:rounded-[30px] sm:px-5 lg:px-6 xl:order-none xl:mt-0'>
								<div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
									<div className='max-w-3xl'>
										<p className='text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500'>
											{sectionMeta[activeSection].eyebrow}
										</p>
										<h2 className='mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl'>
											{sectionMeta[activeSection].title}
										</h2>
										<p className='mt-3 text-sm leading-7 text-slate-400 sm:text-[15px]'>
											{sectionMeta[activeSection].description}
										</p>
									</div>

									<div className='flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end'>
										<button
											type='button'
											onClick={handleRefresh}
											className='inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08] sm:w-auto'
										>
											<IoRefreshOutline className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
											Refresh
										</button>
										<Link
											to='/'
											className='inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08] sm:w-auto'
										>
											<IoArrowBack className='h-4 w-4' />
											Back to chats
										</Link>
									</div>
								</div>
							</div>

							{errorMessage ? (
								<div className='order-3 mt-4 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 xl:order-none'>
									{errorMessage}
								</div>
							) : null}

							<div className='order-4 mt-3 min-w-0 overflow-x-hidden overflow-y-visible sm:mt-4 xl:order-none xl:custom-scrollbar xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1'>
								{activeSection === "analytics" ? (
									<DeveloperAnalyticsPage loading={loading} overview={overview} users={users} groups={groups} />
								) : null}

								{activeSection === "users" ? (
									<DeveloperUsersPage
										authUser={authUser}
										loading={loading}
										filteredUsers={filteredUsers}
										searchValue={searchValue}
										setSearchValue={setSearchValue}
										actionKey={actionKey}
										handleRoleChange={handleRoleChange}
										handleVerificationToggle={handleVerificationToggle}
										openBanModal={openBanModal}
										openArchiveModal={openArchiveModal}
										openEditUserModal={openEditUserModal}
										openDeveloperPermissionsModal={openDeveloperPermissionsModal}
										canManageUsers={canManageUsers}
										canEditUserData={canEditUserData}
										canManageDeveloperPermissions={canManageDeveloperPermissions}
									/>
								) : null}

								{activeSection === "groups" ? (
									<DeveloperGroupsPage
										loading={loading}
										filteredGroups={filteredGroups}
										groupSearchValue={groupSearchValue}
										setGroupSearchValue={setGroupSearchValue}
										groupTotals={groupTotals}
										actionKey={actionKey}
										handleInspectGroup={handleInspectGroup}
										openDeleteGroupPopup={openDeleteGroupPopup}
										canDeleteGroups={canDeleteGroups}
									/>
								) : null}

								{activeSection === "reports" ? (
									<DeveloperReportsPage
										loading={loading}
										reports={reports}
										users={users}
										groups={groups}
										actionKey={actionKey}
										onCreateReport={handleCreateReport}
										onUpdateReport={handleUpdateReport}
										onDeleteReport={handleDeleteReport}
										openDeleteReportPopup={openDeleteReportPopup}
										canManageReports={canManageReports}
										canDeleteReports={canDeleteReports}
									/>
								) : null}

								{activeSection === "audit" ? (
									<DeveloperAuditLogsPage loading={loading} auditLogs={auditLogs} />
								) : null}
							</div>
						</div>
					</div>
				</div>
			</div>

			{selectedGroupId ? (
				<DeveloperGroupInspectorModal
					group={selectedGroupDetails || groups.find((group) => group._id === selectedGroupId) || null}
					allUsers={users}
					loading={groupDetailsLoading}
					actionKey={actionKey}
					onClose={closeGroupInspector}
					onRefresh={() => loadGroupDetails(selectedGroupId)}
					onDeleteGroup={openDeleteGroupPopup}
					onDeleteMessage={openDeleteGroupMessagePopup}
					onSaveGroupSettings={handleSaveGroupSettings}
					onAddMember={handleAddGroupMembersAsDeveloper}
					onUpdateMemberRole={handleUpdateGroupMemberRoleAsDeveloper}
					onRemoveMember={handleRemoveGroupMemberAsDeveloper}
					canManageGroups={canManageGroups}
					canDeleteGroup={canDeleteGroups}
					canDeleteMessage={canDeleteMessages}
				/>
			) : null}

			{confirmState ? (
				<div className='absolute inset-0 z-50 flex items-center justify-center bg-slate-950/78 px-4 backdrop-blur-md'>
					<div className='w-full max-w-xl rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.94))] p-6 shadow-[0_28px_90px_rgba(2,6,23,0.6)] sm:p-7'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500'>
							{confirmState.type === "delete-group"
								? "Delete group"
								: confirmState.type === "delete-group-message"
									? "Delete group message"
									: "Delete report"}
						</p>

						<h3 className='mt-3 text-2xl font-semibold text-white'>
							{confirmState.type === "delete-group"
								? `Delete ${confirmState.group.title}?`
								: confirmState.type === "delete-group-message"
									? "Delete this message for everyone?"
									: "Delete this report?"}
						</h3>

						<p className='mt-3 text-sm leading-7 text-slate-400'>
							{confirmState.type === "delete-group"
								? "This will permanently remove the whole group, all members, and all saved group messages."
								: confirmState.type === "delete-group-message"
									? "This will permanently remove the selected message from the group conversation for every member."
									: "This will permanently remove the report from the moderation queue."}
						</p>

						{confirmState.type === "delete-group" ? (
							<div className='mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300'>
								<p className='font-semibold text-white'>{confirmState.group.title}</p>
								<p className='mt-1 text-slate-400'>
									{confirmState.group.memberCount} members · {confirmState.group.messageCount} messages
								</p>
							</div>
						) : confirmState.type === "delete-group-message" ? (
							<div className='mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300'>
								<p className='font-semibold text-white'>
									{confirmState.message.sender?.fullName || "Unknown user"}
								</p>
								<p className='mt-2 whitespace-pre-wrap break-words text-slate-400'>
									{confirmState.message.previewText || confirmState.message.message || "Message"}
								</p>
							</div>
						) : (
							<div className='mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300'>
								<p className='font-semibold text-white'>{confirmState.report.targetLabel}</p>
								<p className='mt-1 text-slate-400'>{confirmState.report.reason}</p>
							</div>
						)}

						<div className='mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
							<button
								type='button'
								onClick={closeConfirmPopup}
								disabled={isConfirmBusy}
								className='inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50'
							>
								Cancel
							</button>
							<button
								type='button'
								onClick={handleConfirmAction}
								disabled={isConfirmBusy}
								className='inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(244,63,94,0.28)] transition hover:from-rose-400 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60'
							>
								{isConfirmBusy
									? "Processing..."
									: confirmState.type === "delete-group"
										? "Delete group"
										: confirmState.type === "delete-group-message"
											? "Delete message"
											: "Delete report"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{modalState ? (
				<div
					className={`fixed inset-0 z-30 flex justify-center bg-slate-950/72 px-4 backdrop-blur-md ${
						isWideModal
							? "items-center overflow-y-auto py-4 lg:overflow-y-hidden lg:px-6"
							: "items-start overflow-y-auto py-4 lg:items-center lg:py-6"
					}`}
				>
					<div
						className={`w-full rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.94))] shadow-[0_28px_90px_rgba(2,6,23,0.6)] ${
							isDeveloperPermissionsModal
								? "custom-scrollbar max-h-[calc(100dvh-1.5rem)] max-w-6xl overflow-y-auto p-4 sm:p-5 lg:max-h-[calc(100dvh-2rem)] lg:p-5"
								: isEditUserModal
									? "custom-scrollbar max-h-[calc(100dvh-1.5rem)] max-w-4xl overflow-y-auto p-4 sm:p-5 lg:max-h-[calc(100dvh-2rem)] lg:p-6"
									: "max-w-xl p-6 sm:p-7"
						}`}
					>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500'>
							{modalState.type === "archive-user"
								? modalState.shouldArchive
									? "Archive account"
									: "Restore account"
								: modalState.type === "ban-user"
									? modalState.shouldBan
										? "Ban account"
										: "Restore account"
									: modalState.type === "edit-user"
										? "Edit user data"
									: modalState.type === "developer-permissions"
										? "Developer permissions"
									: ""}
						</p>

						<h3 className='mt-2 text-2xl font-semibold text-white'>
							{modalState.type === "archive-user"
								? modalState.shouldArchive
									? `Archive ${modalState.user.fullName}?`
									: `Restore ${modalState.user.fullName}?`
								: modalState.type === "ban-user"
									? modalState.shouldBan
										? `Ban ${modalState.user.fullName}?`
										: `Remove ban from ${modalState.user.fullName}?`
									: modalState.type === "edit-user"
										? `Edit ${modalState.user.fullName}`
									: modalState.type === "developer-permissions"
										? `Permissions for ${modalState.user.fullName}`
									: ""}
						</h3>

						<p className={`mt-2 text-sm text-slate-400 ${isWideModal ? "leading-6" : "leading-7"}`}>
							{modalState.type === "archive-user"
								? modalState.shouldArchive
									? `This moves @${modalState.user.username} to archive. Conversations, messages, and profile data stay saved and can be restored later.`
									: modalState.user.isBanned
										? `This restores @${modalState.user.username} from archive, but the ban will still stay active until you remove it.`
										: `This restores @${modalState.user.username} and makes the account visible in the app again.`
								: modalState.type === "ban-user"
									? modalState.shouldBan
										? `This blocks @${modalState.user.username} from logging in and disconnects any active session.`
										: `This restores access for @${modalState.user.username}.`
									: modalState.type === "edit-user"
										? `Update @${modalState.user.username} profile details, username, avatar, bio, or password from one place. Role, badge, ban, and archive controls stay available on the user card.`
									: modalState.type === "developer-permissions"
										? `Primary developer can grant full access or specific moderation actions to @${modalState.user.username}.`
									: ""}
						</p>

						{modalState.type === "ban-user" && modalState.shouldBan ? (
							<div className='mt-5'>
								<label className='mb-2 block text-sm font-medium text-slate-200'>Optional reason</label>
								<textarea
									rows='4'
									value={modalState.reason}
									onChange={(event) => updateModalReason(event.target.value)}
									placeholder='Visible only inside the developer console'
									className='custom-scrollbar min-h-[132px] w-full rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/60'
								/>
								<p className='mt-2 text-xs text-slate-500'>Saved for developer moderation only.</p>
							</div>
						) : null}

						{modalState.type === "edit-user" ? (
							<div className='mt-5 grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]'>
								<div className='rounded-[24px] border border-sky-300/14 bg-[linear-gradient(145deg,rgba(14,165,233,0.1),rgba(15,23,42,0.55))] p-4'>
									<div className='mx-auto h-24 w-24 overflow-hidden rounded-full ring-2 ring-sky-300/20'>
										<img src={editUserAvatar} alt={modalState.user.fullName} className='h-full w-full object-cover' />
									</div>
									<div className='mt-4 text-center'>
										<p className='text-sm font-semibold text-white'>{modalState.user.fullName}</p>
										<p className='mt-1 text-xs text-slate-400'>@{modalState.user.username}</p>
									</div>
									<div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
										<span className='rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300'>
											{modalState.user.role}
										</span>
										{modalState.user.isVerified ? (
											<span className='rounded-full border border-sky-300/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100'>
												Verified
											</span>
										) : null}
										{modalState.user.isArchived ? (
											<span className='rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
												Archived
											</span>
										) : null}
										{modalState.user.isBanned ? (
											<span className='rounded-full border border-rose-300/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-100'>
												Banned
											</span>
										) : null}
									</div>
									<label className='mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/16'>
										<IoCameraOutline className='h-4 w-4' />
										<span>{modalState.draft.profilePicFile ? "Change avatar" : "Upload avatar"}</span>
										<input
											type='file'
											accept='image/*'
											className='hidden'
											onChange={(event) => updateEditUserProfilePic(event.target.files?.[0] || null)}
										/>
									</label>
									<p className='mt-3 text-center text-xs leading-5 text-slate-400'>
										{modalState.draft.profilePicFile
											? modalState.draft.profilePicFile.name
											: "Leave empty to keep the current profile photo."}
									</p>
								</div>

								<div className='grid gap-4 md:grid-cols-2'>
									<label className='block'>
										<span className='mb-2 flex items-center gap-2 text-sm font-medium text-slate-200'>
											<IoPersonOutline className='h-4 w-4 text-sky-200/80' />
											Full name
										</span>
										<input
											type='text'
											value={modalState.draft.fullName}
											onChange={(event) => updateEditUserDraft("fullName", event.target.value)}
											maxLength={80}
											className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/45 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/60'
										/>
									</label>

									<label className='block'>
										<span className='mb-2 block text-sm font-medium text-slate-200'>Username / login</span>
										<input
											type='text'
											value={modalState.draft.username}
											onChange={(event) => updateEditUserDraft("username", event.target.value)}
											maxLength={20}
											className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/45 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/60'
										/>
									</label>

									<label className='block'>
										<span className='mb-2 block text-sm font-medium text-slate-200'>Gender</span>
										<select
											value={modalState.draft.gender}
											onChange={(event) => updateEditUserDraft("gender", event.target.value)}
											className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/45 px-4 text-sm text-slate-100 outline-none transition focus:border-sky-400/40 focus:bg-slate-950/60'
										>
											<option value='male'>Male</option>
											<option value='female'>Female</option>
										</select>
									</label>

									<div className='rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300'>
										<p className='font-semibold text-white'>Moderation state</p>
										<p className='mt-1 text-xs leading-5 text-slate-400'>
											Role, badge, ban, and archive stay available from the action buttons on the user card.
										</p>
									</div>

									<label className='block md:col-span-2'>
										<span className='mb-2 block text-sm font-medium text-slate-200'>Bio</span>
										<textarea
											rows='5'
											value={modalState.draft.bio}
											onChange={(event) => updateEditUserDraft("bio", event.target.value)}
											maxLength={700}
											className='custom-scrollbar min-h-[140px] w-full rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/60'
										/>
										<p className='mt-2 text-right text-xs text-slate-500'>{modalState.draft.bio.length}/700</p>
									</label>

									<div className='rounded-[22px] border border-sky-300/12 bg-[linear-gradient(145deg,rgba(14,165,233,0.08),rgba(15,23,42,0.54))] p-4 md:col-span-2'>
										<div className='flex items-center gap-2'>
											<IoKeyOutline className='h-4.5 w-4.5 text-sky-200/85' />
											<p className='text-sm font-semibold text-white'>Reset password</p>
										</div>
										<div className='mt-3 grid gap-3 md:grid-cols-2'>
											<label className='block'>
												<span className='mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400'>New password</span>
												<input
													type='password'
													value={modalState.draft.newPassword}
													onChange={(event) => updateEditUserDraft("newPassword", event.target.value)}
													className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/50 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/65'
												/>
											</label>
											<label className='block'>
												<span className='mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-slate-400'>Confirm password</span>
												<input
													type='password'
													value={modalState.draft.confirmPassword}
													onChange={(event) => updateEditUserDraft("confirmPassword", event.target.value)}
													className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/50 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/65'
												/>
											</label>
										</div>
										<p className='mt-3 text-xs leading-5 text-slate-400'>
											Leave both password fields empty if you do not want to change the password.
										</p>
									</div>
								</div>
							</div>
						) : null}

						{modalState.type === "developer-permissions" ? (
							<div className='mt-4 space-y-3.5'>
								<div className='rounded-[22px] border border-sky-300/12 bg-[linear-gradient(135deg,rgba(14,165,233,0.1),rgba(59,130,246,0.04))] px-4 py-3'>
									<div className='grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'>
										<div>
											<p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/75'>Permission profile</p>
											<p className='mt-1 text-sm leading-6 text-slate-300'>
												Choose broad access or grant only the exact actions this developer needs.
											</p>
										</div>
										<div className='flex flex-wrap items-center gap-2 text-xs'>
											<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-medium text-slate-200'>
												{developerPermissionDefinitions.filter((permission) => modalState.permissions?.[permission.key]).length} enabled
											</span>
											<span className='rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 font-medium text-amber-100'>
												Primary owner only for grants
											</span>
										</div>
									</div>
								</div>

								<div className='space-y-2.5'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>Access controls</p>
									<div className='grid gap-3 xl:grid-cols-4'>
										{developerPermissionDefinitions
											.filter((permission) => !permission.key.startsWith("delete"))
											.map((permission) => {
												const isChecked = Boolean(modalState.permissions?.[permission.key]);
												return (
													<label
														key={permission.key}
														className={`flex items-start gap-3 rounded-[20px] border px-3 py-3 transition ${
															isChecked
																? "border-sky-300/24 bg-sky-500/10 shadow-[0_16px_36px_rgba(14,165,233,0.08)]"
																: "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
														}`}
													>
														<input
															type='checkbox'
															checked={isChecked}
															onChange={(event) => updatePermissionsDraft(permission.key, event.target.checked)}
															className='mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/60 text-sky-400'
														/>
														<div className='min-w-0 flex-1'>
															<div className='flex flex-wrap items-center justify-between gap-2'>
																<p className='text-sm font-semibold text-white'>{permission.label}</p>
																<span
																	className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
																		isChecked
																			? "border-sky-300/24 bg-sky-500/14 text-sky-100"
																			: "border-white/10 bg-white/[0.04] text-slate-400"
																	}`}
																>
																	{isChecked ? "Enabled" : "Off"}
																</span>
															</div>
															<p className='mt-1 text-[12px] leading-5 text-slate-400'>{permission.description}</p>
														</div>
													</label>
												);
											})}
									</div>
								</div>

								<div className='space-y-2.5'>
									<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500'>Destructive actions</p>
									<div className='grid gap-3 lg:grid-cols-3'>
										{developerPermissionDefinitions
											.filter((permission) => permission.key.startsWith("delete"))
											.map((permission) => {
												const isChecked = Boolean(modalState.permissions?.[permission.key]);
												return (
													<label
														key={permission.key}
														className={`flex items-start gap-3 rounded-[20px] border px-3 py-3 transition ${
															isChecked
																? "border-rose-300/22 bg-rose-500/10 shadow-[0_16px_36px_rgba(244,63,94,0.08)]"
																: "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
														}`}
													>
														<input
															type='checkbox'
															checked={isChecked}
															onChange={(event) => updatePermissionsDraft(permission.key, event.target.checked)}
															className='mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/60 text-rose-400'
														/>
														<div className='min-w-0 flex-1'>
															<div className='flex flex-wrap items-center justify-between gap-2'>
																<p className='text-sm font-semibold text-white'>{permission.label}</p>
																<span
																	className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
																		isChecked
																			? "border-rose-300/22 bg-rose-500/14 text-rose-100"
																			: "border-white/10 bg-white/[0.04] text-slate-400"
																	}`}
																>
																	{isChecked ? "Enabled" : "Off"}
																</span>
															</div>
															<p className='mt-1 text-[12px] leading-5 text-slate-400'>{permission.description}</p>
														</div>
													</label>
												);
											})}
									</div>
								</div>
							</div>
						) : null}

						<div className={`flex flex-col-reverse gap-3 sm:flex-row sm:justify-end ${isWideModal ? "mt-4" : "mt-5"}`}>
							<button
								type='button'
								onClick={closeModal}
								disabled={isModalBusy}
								className='inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50'
							>
								Cancel
							</button>
							<button
								type='button'
								onClick={handleModalConfirm}
								disabled={isModalBusy}
								className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
									(modalState.type === "archive-user" && !modalState.shouldArchive) ||
									(modalState.type === "ban-user" && !modalState.shouldBan)
										? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_16px_34px_rgba(16,185,129,0.28)] hover:from-emerald-400 hover:to-teal-400"
										: modalState.type === "edit-user" || modalState.type === "developer-permissions"
											? "bg-gradient-to-r from-sky-500 to-cyan-500 shadow-[0_16px_34px_rgba(14,165,233,0.28)] hover:from-sky-400 hover:to-cyan-400"
										: "bg-gradient-to-r from-rose-500 to-orange-500 shadow-[0_16px_34px_rgba(244,63,94,0.28)] hover:from-rose-400 hover:to-orange-400"
								}`}
							>
								{isModalBusy
									? "Processing..."
									: modalState.type === "archive-user"
										? modalState.shouldArchive
											? "Archive user"
											: "Restore user"
										: modalState.type === "ban-user"
											? modalState.shouldBan
												? "Ban user"
												: "Remove ban"
											: modalState.type === "edit-user"
												? "Save user changes"
											: modalState.type === "developer-permissions"
												? "Save permissions"
											: ""}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
};

export default DeveloperDashboard;
