import toast from "react-hot-toast";

export const DATABASE_UNAVAILABLE_MESSAGE = "Database temporarily unavailable. Please retry in a moment.";
export const DATABASE_UNAVAILABLE_RETRY_MS = 15000;

const DATABASE_UNAVAILABLE_TOAST_ID = "database-unavailable";
const DATABASE_UNAVAILABLE_TOAST_COOLDOWN_MS = 15000;
let lastDatabaseUnavailableToastAt = 0;

const normalizeMessage = (value) => (typeof value === "string" ? value.trim() : "");

export const isDatabaseUnavailableMessage = (value) =>
	normalizeMessage(value).toLowerCase().includes(DATABASE_UNAVAILABLE_MESSAGE.toLowerCase());

export const showRequestErrorToast = (value) => {
	const message = normalizeMessage(value);
	if (!message) return;

	if (isDatabaseUnavailableMessage(message)) {
		const now = Date.now();
		if (now - lastDatabaseUnavailableToastAt < DATABASE_UNAVAILABLE_TOAST_COOLDOWN_MS) {
			return;
		}

		lastDatabaseUnavailableToastAt = now;
		toast.error(DATABASE_UNAVAILABLE_MESSAGE, {
			id: DATABASE_UNAVAILABLE_TOAST_ID,
			duration: 5000,
		});
		return;
	}

	toast.error(message);
};

export const getRetryDelayMs = (
	value,
	{ standardMs = 2200, databaseUnavailableMs = DATABASE_UNAVAILABLE_RETRY_MS } = {}
) =>
	isDatabaseUnavailableMessage(value) ? databaseUnavailableMs : standardMs;
