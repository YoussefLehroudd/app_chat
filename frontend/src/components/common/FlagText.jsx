import { Fragment, useEffect, useMemo, useState } from "react";
import { getFlagEmojiAssetUrls, getFlagEmojiEntry, splitTextByFlagEmojis } from "../../utils/flagEmoji";

export const FlagEmoji = ({
	emoji,
	className = "inline-block h-[1em] w-[1em] align-[-0.16em] object-contain",
}) => {
	const flagEmoji = typeof emoji === "string" ? getFlagEmojiEntry(emoji) : emoji;
	const assetUrls = useMemo(
		() => (flagEmoji ? getFlagEmojiAssetUrls(flagEmoji) : []),
		[flagEmoji?.id, flagEmoji?.native, flagEmoji?.unified]
	);
	const [assetIndex, setAssetIndex] = useState(0);

	useEffect(() => {
		setAssetIndex(0);
	}, [flagEmoji?.id, flagEmoji?.native, flagEmoji?.unified]);

	if (!flagEmoji) {
		return <span>{typeof emoji === "string" ? emoji : ""}</span>;
	}

	if (assetIndex >= assetUrls.length || !assetUrls.length) {
		return <span className={className}>{flagEmoji.native}</span>;
	}

	return (
		<img
			src={assetUrls[assetIndex]}
			alt=''
			role='img'
			aria-label={flagEmoji.name}
			title={flagEmoji.name}
			className={className}
			loading='lazy'
			decoding='async'
			draggable='false'
			onError={() => setAssetIndex((currentIndex) => currentIndex + 1)}
		/>
	);
};

const FlagText = ({
	text,
	className = "",
	imgClassName = "inline-block h-[1em] w-[1em] align-[-0.16em] object-contain",
}) => {
	if (!text) return null;

	const textParts = splitTextByFlagEmojis(text);

	return (
		<span className={className}>
			{textParts.map((part, index) => {
				if (part.type === "text") {
					return <Fragment key={`text-${index}`}>{part.value}</Fragment>;
				}

				return <FlagEmoji key={`flag-${part.entry?.id || index}`} emoji={part.entry} className={imgClassName} />;
			})}
		</span>
	);
};

export default FlagText;
