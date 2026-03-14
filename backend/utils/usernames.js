const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

const normalizeUsername = (username) =>
	typeof username === "string" ? username.trim().toLowerCase() : "";

const buildUsernameInsensitiveLookup = (username) => ({
	equals: normalizeUsername(username),
	mode: "insensitive",
});

export { USERNAME_PATTERN, normalizeUsername, buildUsernameInsensitiveLookup };
