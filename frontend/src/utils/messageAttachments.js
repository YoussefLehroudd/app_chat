const getAttachmentTypeFromMimeType = (mimeType, fileName = "") => {
	const normalizedMimeType = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
	const normalizedFileName = typeof fileName === "string" ? fileName.toLowerCase() : "";

	if (normalizedMimeType.startsWith("image/")) return "IMAGE";
	if (normalizedMimeType.startsWith("video/")) return "VIDEO";
	if (normalizedMimeType === "application/pdf" || normalizedFileName.endsWith(".pdf")) return "PDF";
	return "FILE";
};

const isImageAttachment = (attachment) =>
	attachment?.type === "IMAGE" || attachment?.mimeType?.startsWith?.("image/");

const isVideoAttachment = (attachment) =>
	attachment?.type === "VIDEO" || attachment?.mimeType?.startsWith?.("video/");

const getAttachmentLabel = (attachment) => {
	if (!attachment) return "Attachment";

	if (attachment.fileName?.trim()) {
		return attachment.fileName.trim();
	}

	if (isImageAttachment(attachment)) return "Photo";
	if (isVideoAttachment(attachment)) return "Video";
	if (attachment.type === "PDF") return "PDF";
	return "File";
};

const getAttachmentKindLabel = (attachment) => {
	if (!attachment) return "Attachment";
	if (isImageAttachment(attachment)) return "Photo";
	if (isVideoAttachment(attachment)) return "Video";
	if (attachment.type === "PDF") return "PDF";
	return "File";
};

const formatAttachmentSize = (value) => {
	if (!Number.isFinite(value) || value <= 0) return "";

	if (value < 1024) return `${value} B`;

	const kb = value / 1024;
	if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;

	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;

	const gb = mb / 1024;
	return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
};

const buildTemporaryAttachment = (file, previewUrl) => ({
	url: previewUrl,
	type: getAttachmentTypeFromMimeType(file?.type, file?.name),
	mimeType: file?.type || null,
	fileName: file?.name || null,
	fileSize: Number.isFinite(file?.size) ? file.size : null,
	resourceType:
		file?.type?.startsWith?.("image/") ? "image" : file?.type?.startsWith?.("video/") ? "video" : "raw",
});

const getMessageSummaryText = (message) => {
	if (!message) return "Message";
	if (message.audio && !message.message) return "Audio message";
	if (message.attachment && !message.message) return getAttachmentLabel(message.attachment);
	if (typeof message.message === "string" && message.message.trim()) return message.message.trim();
	if (typeof message.previewText === "string" && message.previewText.trim()) return message.previewText.trim();
	return "Message";
};

const getAttachmentDownloadUrl = (message) => {
	if (!message?._id || !message?.attachment?.url) return "";
	return `/api/messages/attachments/${message._id}/download`;
};

export {
	buildTemporaryAttachment,
	formatAttachmentSize,
	getAttachmentDownloadUrl,
	getAttachmentKindLabel,
	getAttachmentLabel,
	getAttachmentTypeFromMimeType,
	getMessageSummaryText,
	isImageAttachment,
	isVideoAttachment,
};
