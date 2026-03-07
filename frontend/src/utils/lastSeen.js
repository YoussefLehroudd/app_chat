const isSameDay = (a, b) =>
	a.getFullYear() === b.getFullYear() &&
	a.getMonth() === b.getMonth() &&
	a.getDate() === b.getDate();

const formatTime = (date) =>
	date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDate = (date) =>
	date.toLocaleDateString("fr-FR", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	});

const formatLastSeen = (lastSeen) => {
	if (!lastSeen) return "Hors ligne";
	const date = new Date(lastSeen);
	if (Number.isNaN(date.getTime())) return "Hors ligne";

	const now = new Date();
	const time = formatTime(date);

	if (isSameDay(date, now)) {
		return `Vu aujourd'hui à ${time}`;
	}

	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (isSameDay(date, yesterday)) {
		return `Vu hier à ${time}`;
	}

	return `Vu le ${formatDate(date)} à ${time}`;
};

export default formatLastSeen;
