const USER_ROLE = "USER";
const DEVELOPER_ROLE = "DEVELOPER";
const PRIMARY_DEVELOPER_FALLBACK_USERNAME = "Youssefhrd";

const normalizeUsername = (username) => username?.trim().toLowerCase() || "";

const getConfiguredPrimaryDeveloperUsername = () =>
	normalizeUsername(process.env.PRIMARY_DEVELOPER_USERNAME || PRIMARY_DEVELOPER_FALLBACK_USERNAME);

const isPrimaryDeveloperUsername = (username) =>
	normalizeUsername(username) === getConfiguredPrimaryDeveloperUsername();

const getConfiguredDeveloperUsernames = () =>
	(process.env.DEVELOPER_USERNAMES || "")
		.split(",")
		.map((username) => normalizeUsername(username))
		.filter(Boolean);

const shouldBootstrapDeveloper = (username) =>
	getConfiguredDeveloperUsernames().includes(normalizeUsername(username));

const getRoleForNewAccount = (username) => (shouldBootstrapDeveloper(username) ? DEVELOPER_ROLE : USER_ROLE);

export {
	USER_ROLE,
	DEVELOPER_ROLE,
	shouldBootstrapDeveloper,
	getRoleForNewAccount,
	isPrimaryDeveloperUsername,
};
