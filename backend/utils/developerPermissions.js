const DEVELOPER_PERMISSION_KEYS = [
	"fullAccess",
	"manageUsers",
	"manageGroups",
	"manageReports",
	"deleteGroups",
	"deleteMessages",
	"deleteReports",
];

const DEFAULT_DEVELOPER_PERMISSIONS = {
	fullAccess: false,
	manageUsers: false,
	manageGroups: false,
	manageReports: false,
	deleteGroups: false,
	deleteMessages: false,
	deleteReports: false,
};

const normalizeDeveloperPermissions = (value) => {
	const rawValue =
		value && typeof value === "object" && !Array.isArray(value) ? value : DEFAULT_DEVELOPER_PERMISSIONS;

	return DEVELOPER_PERMISSION_KEYS.reduce((accumulator, key) => {
		accumulator[key] = Boolean(rawValue[key]);
		return accumulator;
	}, {});
};

const resolveDeveloperPermissions = (user) => {
	if (!user || user.role !== "DEVELOPER") {
		return { ...DEFAULT_DEVELOPER_PERMISSIONS };
	}

	if (user.isPrimaryDeveloper) {
		return DEVELOPER_PERMISSION_KEYS.reduce((accumulator, key) => {
			accumulator[key] = true;
			return accumulator;
		}, {});
	}

	const normalizedPermissions = normalizeDeveloperPermissions(user.developerPermissions);
	if (!normalizedPermissions.fullAccess) {
		return normalizedPermissions;
	}

	return DEVELOPER_PERMISSION_KEYS.reduce((accumulator, key) => {
		accumulator[key] = true;
		return accumulator;
	}, {});
};

const hasDeveloperPermission = (user, permissionKey) => {
	if (!permissionKey) return false;
	if (!DEVELOPER_PERMISSION_KEYS.includes(permissionKey)) return false;
	return Boolean(resolveDeveloperPermissions(user)[permissionKey]);
};

const ensurePrimaryDeveloper = (user) => {
	if (user?.role === "DEVELOPER" && user?.isPrimaryDeveloper) {
		return;
	}

	const error = new Error("Only the primary developer can manage developer permissions");
	error.statusCode = 403;
	throw error;
};

const ensureDeveloperPermission = (user, permissionKey, errorMessage) => {
	if (hasDeveloperPermission(user, permissionKey)) {
		return;
	}

	const error = new Error(errorMessage || "You do not have permission to perform this action");
	error.statusCode = 403;
	throw error;
};

export {
	DEFAULT_DEVELOPER_PERMISSIONS,
	DEVELOPER_PERMISSION_KEYS,
	ensureDeveloperPermission,
	ensurePrimaryDeveloper,
	hasDeveloperPermission,
	normalizeDeveloperPermissions,
	resolveDeveloperPermissions,
};
