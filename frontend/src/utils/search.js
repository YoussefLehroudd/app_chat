const normalizeSearchText = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

export const normalizeUserSearchQuery = (value) => normalizeSearchText(value).replace(/^@+/, "");

export const matchesUserSearchQuery = (query, values) => {
	const normalizedQuery = normalizeUserSearchQuery(query);
	if (!normalizedQuery) return true;

	return values
		.filter((value) => typeof value === "string" && value.trim())
		.some((value) => normalizeSearchText(value).includes(normalizedQuery));
};

