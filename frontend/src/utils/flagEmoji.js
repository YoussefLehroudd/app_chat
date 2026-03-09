import data from "@emoji-mart/data";

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TWEMOJI_BASE_URL = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets";
const FLAG_CDN_BASE_URL = "https://flagcdn.com";

export const unifiedToNativeEmoji = (unifiedValue = "") => {
	if (!unifiedValue) return "";

	try {
		return unifiedValue
			.split("-")
			.map((codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
			.join("");
	} catch {
		return "";
	}
};

const stripVariationSelectors = (unifiedValue = "") =>
	unifiedValue
		.split("-")
		.filter((codePoint) => codePoint.toLowerCase() !== "fe0f")
		.join("-");

const flagCategory = data.categories.find((category) => category.id === "flags");

export const FLAG_EMOJI_ENTRIES = (flagCategory?.emojis || [])
	.map((emojiId) => {
		const emoji = data.emojis[emojiId];
		const primarySkin = emoji?.skins?.[0];
		const exactNative = unifiedToNativeEmoji(primarySkin?.unified);

		if (!emoji || !primarySkin?.unified || !exactNative) {
			return null;
		}

		return {
			id: emoji.id,
			name: emoji.name || emojiId,
			native: exactNative,
			unified: primarySkin.unified.toLowerCase(),
		};
	})
	.filter(Boolean);

const FLAG_EMOJI_BY_NATIVE = new Map(FLAG_EMOJI_ENTRIES.map((emoji) => [emoji.native, emoji]));

const FLAG_EMOJI_PATTERN = new RegExp(
	FLAG_EMOJI_ENTRIES.map((emoji) => emoji.native)
		.sort((flagA, flagB) => flagB.length - flagA.length)
		.map((flag) => escapeRegExp(flag))
		.join("|"),
	"gu"
);

export const getFlagEmojiEntry = (nativeEmoji) => FLAG_EMOJI_BY_NATIVE.get(nativeEmoji) || null;

const getRegionalFlagCode = (flagEmoji) => {
	if (!flagEmoji?.unified) return "";

	const codePoints = flagEmoji.unified
		.split("-")
		.map((codePoint) => Number.parseInt(codePoint, 16));

	if (codePoints.length !== 2 || codePoints.some((codePoint) => codePoint < 0x1f1e6 || codePoint > 0x1f1ff)) {
		return "";
	}

	return codePoints
		.map((codePoint) => String.fromCharCode(65 + codePoint - 0x1f1e6))
		.join("")
		.toLowerCase();
};

const buildTwemojiAssetUrls = (unifiedValue = "") => {
	if (!unifiedValue) return [];

	const variants = [...new Set([unifiedValue.toLowerCase(), stripVariationSelectors(unifiedValue.toLowerCase())].filter(Boolean))];
	return variants.flatMap((variant) => [
		`${TWEMOJI_BASE_URL}/svg/${variant}.svg`,
		`${TWEMOJI_BASE_URL}/72x72/${variant}.png`,
	]);
};

export const getFlagEmojiAssetUrls = (nativeEmoji) => {
	const flagEmoji = typeof nativeEmoji === "string" ? getFlagEmojiEntry(nativeEmoji) : nativeEmoji;
	if (!flagEmoji?.unified) return [];

	const urls = [];
	const regionalFlagCode = getRegionalFlagCode(flagEmoji);

	if (regionalFlagCode) {
		urls.push(`${FLAG_CDN_BASE_URL}/w40/${regionalFlagCode}.png`);
	}

	urls.push(...buildTwemojiAssetUrls(flagEmoji.unified));

	return [...new Set(urls)];
};

export const getFlagEmojiAssetUrl = (nativeEmoji) => getFlagEmojiAssetUrls(nativeEmoji)[0] || "";

export const splitTextByFlagEmojis = (text = "") => {
	if (!text) return [];

	const matches = [...text.matchAll(FLAG_EMOJI_PATTERN)];
	if (!matches.length) {
		return [{ type: "text", value: text }];
	}

	const parts = [];
	let currentIndex = 0;

	matches.forEach((match) => {
		const [value] = match;
		const matchIndex = match.index ?? 0;

		if (matchIndex > currentIndex) {
			parts.push({
				type: "text",
				value: text.slice(currentIndex, matchIndex),
			});
		}

		parts.push({
			type: "flag",
			value,
			entry: getFlagEmojiEntry(value),
		});

		currentIndex = matchIndex + value.length;
	});

	if (currentIndex < text.length) {
		parts.push({
			type: "text",
			value: text.slice(currentIndex),
		});
	}

	return parts;
};

export const getFlagOnlyState = (text = "") => {
	const parts = splitTextByFlagEmojis(text);
	if (!parts.length) {
		return { isFlagOnly: false, flagCount: 0 };
	}

	const flagCount = parts.filter((part) => part.type === "flag").length;
	const strippedText = parts
		.filter((part) => part.type === "text")
		.map((part) => part.value)
		.join("")
		.replace(/\s/gu, "");

	return {
		isFlagOnly: flagCount > 0 && strippedText.length === 0,
		flagCount,
	};
};

export const containsFlagEmoji = (text = "") => {
	FLAG_EMOJI_PATTERN.lastIndex = 0;
	return FLAG_EMOJI_PATTERN.test(text);
};
