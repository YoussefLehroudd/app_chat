const maleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Male avatar"><rect width="128" height="128" fill="#0f172a"/><circle cx="64" cy="50" r="28" fill="#38bdf8"/><rect x="28" y="78" width="72" height="36" rx="18" fill="#1d4ed8"/><circle cx="54" cy="46" r="4" fill="#0f172a"/><circle cx="74" cy="46" r="4" fill="#0f172a"/><path d="M52 60c8 6 16 6 24 0" stroke="#0f172a" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
const femaleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Female avatar"><rect width="128" height="128" fill="#111827"/><circle cx="64" cy="50" r="28" fill="#f472b6"/><rect x="26" y="78" width="76" height="36" rx="18" fill="#db2777"/><circle cx="54" cy="46" r="4" fill="#111827"/><circle cx="74" cy="46" r="4" fill="#111827"/><path d="M50 60c9 6 19 6 28 0" stroke="#111827" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;

const toDataUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const defaultMaleAvatar = toDataUri(maleSvg);
const defaultFemaleAvatar = toDataUri(femaleSvg);

const getDefaultAvatar = (gender) => {
	return gender === "female" ? defaultFemaleAvatar : defaultMaleAvatar;
};

export default getDefaultAvatar;
