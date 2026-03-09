import getDefaultAvatar from "./defaultAvatar";

const groupSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Group avatar"><rect width="128" height="128" rx="28" fill="#0f172a"/><circle cx="42" cy="46" r="18" fill="#38bdf8"/><circle cx="86" cy="50" r="14" fill="#7dd3fc"/><path d="M24 92c0-15 12-27 27-27h10c15 0 27 12 27 27v8H24z" fill="#0ea5e9"/><path d="M68 92c0-11 9-20 20-20h1c11 0 20 9 20 20v8H68z" fill="#1d4ed8" opacity=".88"/></svg>`;

const toDataUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const defaultGroupAvatar = toDataUri(groupSvg);

const getConversationFallbackAvatar = (conversation) => {
	if (conversation?.type === "GROUP" || conversation?.isGroup) {
		return defaultGroupAvatar;
	}

	return getDefaultAvatar(conversation?.gender);
};

export default getConversationFallbackAvatar;
