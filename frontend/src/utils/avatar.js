const CLOUDINARY_HOST = "res.cloudinary.com";
const UPLOAD_SEGMENT = "/upload/";

const buildTransform = (size) => `c_fill,w_${size},h_${size},q_auto,f_auto`;

const isCloudinaryUrl = (url) => {
	return typeof url === "string" && url.includes(CLOUDINARY_HOST) && url.includes(UPLOAD_SEGMENT);
};

const hasTransform = (segment) => {
	return (
		segment.startsWith("c_") ||
		segment.startsWith("w_") ||
		segment.startsWith("h_") ||
		segment.startsWith("q_") ||
		segment.startsWith("f_")
	);
};

const getAvatarUrl = (url, size = 96) => {
	if (!url || !isCloudinaryUrl(url)) return url;
	const [prefix, rest] = url.split(UPLOAD_SEGMENT);
	if (!rest) return url;
	const firstSegment = rest.split("/")[0] || "";
	if (hasTransform(firstSegment)) return url;
	return `${prefix}${UPLOAD_SEGMENT}${buildTransform(size)}/${rest}`;
};

const preloadAvatar = (url, size = 96) => {
	const src = getAvatarUrl(url, size);
	if (!src) return;
	const img = new Image();
	img.src = src;
};

export { getAvatarUrl, preloadAvatar };
