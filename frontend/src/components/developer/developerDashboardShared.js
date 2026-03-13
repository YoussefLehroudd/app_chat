import {
	IoArchiveOutline,
	IoBarChartOutline,
	IoChatbubbleEllipsesOutline,
	IoDocumentTextOutline,
	IoFlagOutline,
	IoGlobeOutline,
	IoLockClosedOutline,
	IoPeopleOutline,
	IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { getMessageSummaryText } from "../../utils/messageAttachments";

const statCards = [
	{ id: "totalUsers", label: "Users", icon: IoPeopleOutline },
	{ id: "developerCount", label: "Developers", icon: IoShieldCheckmarkOutline },
	{ id: "archivedCount", label: "Archived", icon: IoArchiveOutline },
	{ id: "bannedCount", label: "Banned", icon: IoLockClosedOutline },
	{ id: "conversationCount", label: "Conversations", icon: IoBarChartOutline },
	{ id: "messageCount", label: "Messages", icon: IoChatbubbleEllipsesOutline },
];

const developerSections = [
	{ id: "analytics", label: "Analytics", icon: IoBarChartOutline, to: "/developer/analytics" },
	{ id: "users", label: "Users", icon: IoPeopleOutline, to: "/developer/users" },
	{ id: "groups", label: "Groups", icon: IoGlobeOutline, to: "/developer/groups" },
	{ id: "reports", label: "Reports", icon: IoFlagOutline, to: "/developer/reports" },
	{ id: "audit", label: "Audit logs", icon: IoDocumentTextOutline, to: "/developer/audit" },
];

const developerPermissionDefinitions = [
	{ key: "fullAccess", label: "Full access", description: "All moderation actions except permission grants." },
	{ key: "manageUsers", label: "Manage users", description: "Roles, bans, archive, and verification." },
	{ key: "editUserData", label: "Edit user data", description: "Profile, username, avatar, bio, and password changes." },
	{ key: "manageGroups", label: "Manage groups", description: "Edit settings, members, and roles." },
	{ key: "manageReports", label: "Manage reports", description: "Create and update moderation reports." },
	{ key: "deleteGroups", label: "Delete groups", description: "Permanent group deletion." },
	{ key: "deleteMessages", label: "Delete messages", description: "Permanent group message deletion." },
	{ key: "deleteReports", label: "Delete reports", description: "Permanent report deletion." },
];

const hasDeveloperPermission = (user, permissionKey) => {
	if (!user || user.role !== "DEVELOPER") return false;
	if (user.isPrimaryDeveloper) return true;
	if (user.developerPermissions?.fullAccess) return true;
	return Boolean(user.developerPermissions?.[permissionKey]);
};

const fetchDeveloperJson = async (url, options = {}) => {
	const response = await fetch(url, options);
	const data = await response.json();

	if (!response.ok || data.error) {
		throw new Error(data.error || "Request failed");
	}

	return data;
};

const formatDeveloperDateTime = (value) => {
	if (!value) return "Unknown time";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));
	} catch {
		return value;
	}
};

const getModerationMessageText = (message) => {
	if (!message) return "No activity yet";
	return getMessageSummaryText(message);
};

export {
	developerSections,
	developerPermissionDefinitions,
	fetchDeveloperJson,
	formatDeveloperDateTime,
	hasDeveloperPermission,
	getModerationMessageText,
	statCards,
};
