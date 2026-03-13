import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";
import { showRequestErrorToast } from "../utils/requestFeedback";
import {
	deletePendingStoryUpload,
	getPendingStoryUploads,
	savePendingStoryUpload,
} from "../utils/storyUploadStore";

const STORIES_REFRESH_INTERVAL_MS = 35000;
const STORY_SOCKET_REFRESH_DEBOUNCE_MS = 600;
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const getUserId = (user) => user?._id || user?.id || null;
const normalizeClipSeconds = (value, fallback = 0) => {
	const parsedValue = Number(value);
	if (!Number.isFinite(parsedValue) || parsedValue < 0) {
		return fallback;
	}

	return Math.round(parsedValue * 1000) / 1000;
};

const normalizeStoryGroups = (payload) => {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.stories)) return payload.stories;
	return [];
};

const createPendingStoryId = () => `pending-story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sortStoriesAscending = (stories) =>
	[...(Array.isArray(stories) ? stories : [])].sort((storyA, storyB) => {
		const storyATime = storyA?.createdAt ? new Date(storyA.createdAt).getTime() : 0;
		const storyBTime = storyB?.createdAt ? new Date(storyB.createdAt).getTime() : 0;
		if (storyATime !== storyBTime) return storyATime - storyBTime;
		return (storyA?._id || "").localeCompare(storyB?._id || "");
	});

const normalizeGroupShape = (group) => {
	const sortedStories = sortStoriesAscending(group?.stories);
	const unseenStories = sortedStories.filter((story) => !story?.isSeen && !story?.isOwn);

	return {
		user: group?.user || null,
		stories: sortedStories,
		hasUnseen: unseenStories.length > 0,
		unseenCount: unseenStories.length,
		latestCreatedAt: sortedStories.at(-1)?.createdAt || group?.latestCreatedAt || null,
	};
};

const sortStoryGroups = (groups, authUserId) => {
	const normalizedGroups = groups.map(normalizeGroupShape);
	const ownGroup = normalizedGroups.find((group) => getUserId(group.user) === authUserId) || null;
	const otherGroups = normalizedGroups
		.filter((group) => getUserId(group.user) !== authUserId)
		.sort((groupA, groupB) => {
			if (groupA.hasUnseen !== groupB.hasUnseen) {
				return groupA.hasUnseen ? -1 : 1;
			}

			const groupATime = groupA.latestCreatedAt ? new Date(groupA.latestCreatedAt).getTime() : 0;
			const groupBTime = groupB.latestCreatedAt ? new Date(groupB.latestCreatedAt).getTime() : 0;
			return groupBTime - groupATime;
		});

	return ownGroup ? [ownGroup, ...otherGroups] : otherGroups;
};

const upsertOwnStoryGroup = (groups, story, authUser, authUserId) => {
	const otherGroups = [];
	let ownGroup = null;

	(groups || []).forEach((group) => {
		if (getUserId(group?.user) === authUserId) {
			ownGroup = group;
			return;
		}
		otherGroups.push(group);
	});

	const nextOwnGroup = normalizeGroupShape({
		...(ownGroup || {}),
		user: ownGroup?.user || authUser || null,
		stories: [...(ownGroup?.stories || []), story],
	});

	return sortStoryGroups([nextOwnGroup, ...otherGroups], authUserId);
};

const replacePendingStory = (groups, pendingStoryId, persistedStory, authUser, authUserId) => {
	let didReplace = false;

	const nextGroups = (groups || []).map((group) => {
		if (getUserId(group?.user) !== authUserId) return group;

		const existingStories = Array.isArray(group?.stories) ? group.stories : [];
		if (existingStories.some((story) => story?._id === persistedStory?._id)) {
			return normalizeGroupShape({ ...group, stories: existingStories });
		}

		const nextStories = existingStories.map((story) => {
			if (story?._id !== pendingStoryId) return story;
			didReplace = true;
			return {
				...persistedStory,
				clientPendingId: pendingStoryId,
			};
		});

		return normalizeGroupShape({ ...group, stories: nextStories });
	});

	if (didReplace) {
		return sortStoryGroups(nextGroups, authUserId);
	}

	return upsertOwnStoryGroup(nextGroups, persistedStory, authUser, authUserId);
};

const removeStoryFromGroups = (groups, storyId, authUserId) =>
	sortStoryGroups(
		(groups || [])
			.map((group) => {
				if (getUserId(group?.user) !== authUserId) return group;

				const nextStories = (group?.stories || []).filter((story) => story?._id !== storyId);
				return normalizeGroupShape({ ...group, stories: nextStories });
			})
			.filter((group) => Array.isArray(group?.stories) && group.stories.length > 0),
		authUserId
	);

const hasStoryReference = (groups, storyId) =>
	(groups || []).some((group) =>
		(group?.stories || []).some((story) => story?._id === storyId || story?.clientPendingId === storyId)
	);

const postStoryInteraction = async (url, payload) => {
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload || {}),
		cache: "no-store",
	});

	const data = await res.json().catch(() => ({}));
	if (res.ok) {
		return { ok: true, data };
	}

	const error = new Error(data?.error || "Failed to send interaction");
	error.status = res.status;
	throw error;
};

const useStories = () => {
	const { authUser } = useAuthContext();
	const { socket } = useSocketContext();
	const authUserId = getUserId(authUser);
	const [storyGroups, setStoryGroups] = useState([]);
	const [loadingStories, setLoadingStories] = useState(false);
	const [creatingStory, setCreatingStory] = useState(false);
	const isMountedRef = useRef(false);
	const inFlightRef = useRef(false);
	const socketRefreshTimeoutRef = useRef(null);
	const storyGroupsRef = useRef([]);
	const pendingStoryPreviewUrlsRef = useRef(new Map());
	const pendingStoryUploadsRef = useRef(new Map());

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (socketRefreshTimeoutRef.current) {
				clearTimeout(socketRefreshTimeoutRef.current);
			}

			pendingStoryPreviewUrlsRef.current.forEach((previewUrl) => {
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
			});
			pendingStoryPreviewUrlsRef.current.clear();
		};
	}, []);

	useEffect(() => {
		storyGroupsRef.current = storyGroups;
	}, [storyGroups]);

	const releasePendingStoryPreview = useCallback((pendingStoryId) => {
		const previewUrl = pendingStoryPreviewUrlsRef.current.get(pendingStoryId);
		if (!previewUrl) return;

		URL.revokeObjectURL(previewUrl);
		pendingStoryPreviewUrlsRef.current.delete(pendingStoryId);
	}, []);

	const buildOptimisticStory = useCallback(
		({ pendingStoryId, normalizedText, file, createdAt, previewUrl, clipStartSeconds = 0, clipDurationSeconds = null }) => {
			const mediaType = file?.type?.startsWith("video/")
				? "VIDEO"
				: file?.type?.startsWith("image/")
					? "IMAGE"
					: "TEXT";

			return {
				_id: pendingStoryId,
				userId: authUserId,
				text: normalizedText,
				mediaUrl: previewUrl,
				mediaType,
				mediaMimeType: file?.type || null,
				author: authUser,
				isOwn: true,
				isSeen: true,
				seenAt: null,
				viewCount: 0,
				createdAt,
				updatedAt: createdAt,
				expiresAt: new Date(Date.now() + STORY_TTL_MS).toISOString(),
				isPendingUpload: true,
				clipStartSeconds: mediaType === "VIDEO" ? normalizeClipSeconds(clipStartSeconds, 0) : 0,
				clipDurationSeconds:
					mediaType === "VIDEO" ? normalizeClipSeconds(clipDurationSeconds, null) : null,
			};
		},
		[authUser, authUserId]
	);

	const insertPendingStory = useCallback(
		({ pendingStoryId, normalizedText, file, createdAt, previewUrl, clipStartSeconds = 0, clipDurationSeconds = null }) => {
			const optimisticStory = buildOptimisticStory({
				pendingStoryId,
				normalizedText,
				file,
				createdAt,
				previewUrl,
				clipStartSeconds,
				clipDurationSeconds,
			});

			if (!hasStoryReference(storyGroupsRef.current, pendingStoryId)) {
				const optimisticStoryGroups = upsertOwnStoryGroup(storyGroupsRef.current, optimisticStory, authUser, authUserId);
				storyGroupsRef.current = optimisticStoryGroups;
				setStoryGroups(optimisticStoryGroups);
			}

			return optimisticStory;
		},
		[authUser, authUserId, buildOptimisticStory]
	);

	const mergePendingStoriesIntoGroups = useCallback(
		(groups) => {
			const pendingStories = storyGroupsRef.current.flatMap((group) =>
				(group?.stories || []).filter((story) => story?.isPendingUpload)
			);

			return pendingStories.reduce((currentGroups, pendingStory) => {
				if (hasStoryReference(currentGroups, pendingStory?._id)) {
					return currentGroups;
				}

				return upsertOwnStoryGroup(currentGroups, pendingStory, authUser, authUserId);
			}, groups);
		},
		[authUser, authUserId]
	);

	const startPendingStoryUpload = useCallback(
		({
			pendingStoryId,
			normalizedText,
			file,
			clipStartSeconds = 0,
			clipDurationSeconds = null,
			fromRecovery = false,
		}) => {
			if (pendingStoryUploadsRef.current.has(pendingStoryId)) {
				return pendingStoryUploadsRef.current.get(pendingStoryId);
			}

			setCreatingStory(true);
			const completion = (async () => {
				const formData = new FormData();
				if (normalizedText) {
					formData.append("text", normalizedText);
				}
				formData.append("clientUploadId", pendingStoryId);
				formData.append("clipStartSeconds", String(normalizeClipSeconds(clipStartSeconds, 0)));
				if (clipDurationSeconds != null) {
					formData.append("clipDurationSeconds", String(normalizeClipSeconds(clipDurationSeconds, 0)));
				}
				if (file) {
					formData.append("storyMedia", file, file.name || "story");
				}

				try {
					const res = await fetch("/api/stories", {
						method: "POST",
						headers: {
							"X-Story-Upload-Id": pendingStoryId,
						},
						body: formData,
					});
					const data = await res.json().catch(() => ({}));
					if (!res.ok) {
						throw new Error(data?.error || "Failed to post story");
					}

					await deletePendingStoryUpload(pendingStoryId).catch(() => {});
					releasePendingStoryPreview(pendingStoryId);

					setStoryGroups((currentGroups) => {
						const nextGroups = replacePendingStory(currentGroups, pendingStoryId, data, authUser, authUserId);
						storyGroupsRef.current = nextGroups;
						return nextGroups;
					});

					toast.success(fromRecovery ? "Story upload resumed" : "Story posted");
					return { ok: true, data, pendingStoryId };
				} catch (error) {
					await deletePendingStoryUpload(pendingStoryId).catch(() => {});
					releasePendingStoryPreview(pendingStoryId);

					setStoryGroups((currentGroups) => {
						const nextGroups = removeStoryFromGroups(currentGroups, pendingStoryId, authUserId);
						storyGroupsRef.current = nextGroups;
						return nextGroups;
					});

					showRequestErrorToast(error.message);
					return { ok: false, error, pendingStoryId };
				} finally {
					pendingStoryUploadsRef.current.delete(pendingStoryId);
					setCreatingStory(pendingStoryUploadsRef.current.size > 0);
				}
			})();

			pendingStoryUploadsRef.current.set(pendingStoryId, completion);
			return completion;
		},
		[authUser, authUserId, releasePendingStoryPreview]
	);

	const refreshStories = useCallback(
		async ({ silent = false } = {}) => {
			if (!authUserId || inFlightRef.current) return [];

			inFlightRef.current = true;
			if (!silent && isMountedRef.current) {
				setLoadingStories(true);
			}

			try {
				const res = await fetch("/api/stories");
				const data = await res.json().catch(() => []);
				if (!res.ok) {
					throw new Error(data?.error || "Failed to load stories");
				}

				const nextStoryGroups = mergePendingStoriesIntoGroups(
					sortStoryGroups(normalizeStoryGroups(data), authUserId)
				);
				if (!isMountedRef.current) return;
				storyGroupsRef.current = nextStoryGroups;
				setStoryGroups(nextStoryGroups);
				return nextStoryGroups;
			} catch (error) {
				if (!silent && isMountedRef.current) {
					showRequestErrorToast(error.message);
				}
				return [];
			} finally {
				inFlightRef.current = false;
				if (!silent && isMountedRef.current) {
					setLoadingStories(false);
				}
			}
		},
		[authUserId, mergePendingStoriesIntoGroups]
	);

	useEffect(() => {
		if (!authUserId) {
			setStoryGroups([]);
			setLoadingStories(false);
			return undefined;
		}

		void refreshStories();
		const refreshInterval = setInterval(() => {
			void refreshStories({ silent: true });
		}, STORIES_REFRESH_INTERVAL_MS);

		return () => clearInterval(refreshInterval);
	}, [authUserId, refreshStories]);

	useEffect(() => {
		if (!authUserId || !authUser) return undefined;

		let isCancelled = false;
		const resumePendingUploads = async () => {
			const drafts = await getPendingStoryUploads().catch(() => []);
			if (isCancelled || !Array.isArray(drafts) || drafts.length === 0) return;

			const sortedDrafts = [...drafts].sort((draftA, draftB) => {
				const draftATime = draftA?.createdAt ? new Date(draftA.createdAt).getTime() : 0;
				const draftBTime = draftB?.createdAt ? new Date(draftB.createdAt).getTime() : 0;
				return draftATime - draftBTime;
			});

			for (const draft of sortedDrafts) {
				if (isCancelled || !draft?.id) return;

				const previewUrl =
					draft.file && !pendingStoryPreviewUrlsRef.current.has(draft.id)
						? URL.createObjectURL(draft.file)
						: pendingStoryPreviewUrlsRef.current.get(draft.id) || null;

				if (previewUrl && !pendingStoryPreviewUrlsRef.current.has(draft.id)) {
					pendingStoryPreviewUrlsRef.current.set(draft.id, previewUrl);
				}

				insertPendingStory({
					pendingStoryId: draft.id,
					normalizedText: typeof draft.text === "string" ? draft.text : "",
					file: draft.file || null,
					createdAt: draft.createdAt || new Date().toISOString(),
					previewUrl,
					clipStartSeconds: normalizeClipSeconds(draft.clipStartSeconds, 0),
					clipDurationSeconds: normalizeClipSeconds(draft.clipDurationSeconds, null),
				});

				void startPendingStoryUpload({
					pendingStoryId: draft.id,
					normalizedText: typeof draft.text === "string" ? draft.text : "",
					file: draft.file || null,
					clipStartSeconds: normalizeClipSeconds(draft.clipStartSeconds, 0),
					clipDurationSeconds: normalizeClipSeconds(draft.clipDurationSeconds, null),
					fromRecovery: true,
				});
			}
		};

		void resumePendingUploads();
		return () => {
			isCancelled = true;
		};
	}, [authUser, authUserId, insertPendingStory, startPendingStoryUpload]);

	const scheduleStoriesRefreshFromSocket = useCallback(() => {
		if (socketRefreshTimeoutRef.current) {
			clearTimeout(socketRefreshTimeoutRef.current);
		}

		socketRefreshTimeoutRef.current = setTimeout(() => {
			void refreshStories({ silent: true });
		}, STORY_SOCKET_REFRESH_DEBOUNCE_MS);
	}, [refreshStories]);

	useEffect(() => {
		if (!socket || !authUserId) return undefined;

		const handleStoryCreated = () => {
			scheduleStoriesRefreshFromSocket();
		};

		const handleStoryDeleted = () => {
			scheduleStoriesRefreshFromSocket();
		};

		const handleStoryViewed = ({ storyId, viewCount } = {}) => {
			if (!storyId || !Number.isFinite(viewCount)) return;

			setStoryGroups((currentGroups) =>
				currentGroups.map((group) => {
					if (getUserId(group?.user) !== authUserId) return group;

					const nextStories = group.stories.map((story) =>
						story?._id === storyId
							? {
									...story,
									viewCount,
							  }
							: story
					);

					return normalizeGroupShape({ ...group, stories: nextStories });
				})
			);
		};

		socket.on("story:created", handleStoryCreated);
		socket.on("story:deleted", handleStoryDeleted);
		socket.on("story:viewed", handleStoryViewed);

		return () => {
			socket.off("story:created", handleStoryCreated);
			socket.off("story:deleted", handleStoryDeleted);
			socket.off("story:viewed", handleStoryViewed);
		};
	}, [authUserId, scheduleStoriesRefreshFromSocket, socket]);

	const createStory = useCallback(
		async ({ text = "", file = null, clipStartSeconds = 0, clipDurationSeconds = null } = {}) => {
			const normalizedText = typeof text === "string" ? text.trim() : "";
			if (!normalizedText && !file) {
				toast.error("Add text, image, or video");
				return { ok: false };
			}

			if (!authUserId || !authUser) {
				toast.error("You must be logged in to post a story");
				return { ok: false };
			}

			const createdAt = new Date().toISOString();
			const pendingStoryId = createPendingStoryId();
			const previewUrl = file ? URL.createObjectURL(file) : null;
			if (previewUrl) {
				pendingStoryPreviewUrlsRef.current.set(pendingStoryId, previewUrl);
			}

			const optimisticStory = insertPendingStory({
				pendingStoryId,
				normalizedText,
				file,
				createdAt,
				previewUrl,
				clipStartSeconds,
				clipDurationSeconds,
			});

			await savePendingStoryUpload({
				id: pendingStoryId,
				text: normalizedText,
				file: file || null,
				createdAt,
				clipStartSeconds: normalizeClipSeconds(clipStartSeconds, 0),
				clipDurationSeconds: normalizeClipSeconds(clipDurationSeconds, null),
			}).catch(() => {});

			const completion = startPendingStoryUpload({
				pendingStoryId,
				normalizedText,
				file,
				clipStartSeconds,
				clipDurationSeconds,
			});

			return {
				ok: true,
				pendingStoryId,
				pendingStory: optimisticStory,
				completion,
			};
		},
		[authUser, authUserId, insertPendingStory, startPendingStoryUpload]
	);

	const markStoryAsSeen = useCallback(async (storyId) => {
		if (!storyId) return;

		setStoryGroups((currentGroups) => {
			let didChange = false;

			const nextGroups = currentGroups.map((group) => {
				if (!Array.isArray(group?.stories) || group.stories.length === 0) return group;

				let hasTargetStory = false;
				const nextStories = group.stories.map((story) => {
					if (story?._id !== storyId) return story;
					hasTargetStory = true;
					if (story.isSeen) return story;
					didChange = true;
					return {
						...story,
						isSeen: true,
					};
				});

				if (!hasTargetStory) return group;
				if (!didChange) return group;
				return normalizeGroupShape({ ...group, stories: nextStories });
			});

			return didChange ? nextGroups : currentGroups;
		});

		try {
			await fetch(`/api/stories/${storyId}/seen`, {
				method: "POST",
			});
		} catch {
			// No-op. Story feed refresh cycle will self-heal.
		}
	}, []);

	const deleteStory = useCallback(
		async (storyId) => {
			if (!storyId) return { ok: false };

			try {
				const res = await fetch(`/api/stories/${storyId}`, {
					method: "DELETE",
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok) {
					throw new Error(data?.error || "Failed to delete story");
				}

				setStoryGroups((currentGroups) => {
					const nextGroups = currentGroups
						.map((group) => {
							const nextStories = group.stories.filter((story) => story?._id !== storyId);
							return normalizeGroupShape({ ...group, stories: nextStories });
						})
						.filter((group) => group.stories.length > 0);

					return sortStoryGroups(nextGroups, authUserId);
				});

				return { ok: true };
			} catch (error) {
				showRequestErrorToast(error.message);
				return { ok: false, error };
			}
		},
		[authUserId]
	);

	const getStoryViewers = useCallback(async (storyId) => {
		if (!storyId) return { ok: false, data: [] };

		try {
			const res = await fetch(`/api/stories/${storyId}/viewers`);
			const data = await res.json().catch(() => []);
			if (!res.ok) {
				throw new Error(data?.error || "Failed to load story viewers");
			}

			return { ok: true, data: Array.isArray(data) ? data : [] };
		} catch (error) {
			showRequestErrorToast(error.message);
			return { ok: false, error, data: [] };
		}
	}, []);

	const reactToStory = useCallback(async (storyId, emoji = "❤️") => {
		if (!storyId) return { ok: false };

		try {
			const { data } = await postStoryInteraction(`/api/stories/${storyId}/react`, { emoji });

			toast.success("Reaction sent");
			return { ok: true, data };
		} catch (error) {
			showRequestErrorToast(error.message);
			return { ok: false, error };
		}
	}, []);

	const commentOnStory = useCallback(async (storyId, message) => {
		if (!storyId) return { ok: false };
		const normalizedMessage = typeof message === "string" ? message.trim() : "";
		if (!normalizedMessage) return { ok: false };

		try {
			const { data } = await postStoryInteraction(`/api/stories/${storyId}/comment`, {
				message: normalizedMessage,
			});

			toast.success("Reply sent");
			return { ok: true, data };
		} catch (error) {
			showRequestErrorToast(error.message);
			return { ok: false, error };
		}
	}, []);

	const ownStoryGroup = useMemo(
		() => storyGroups.find((group) => getUserId(group?.user) === authUserId) || null,
		[authUserId, storyGroups]
	);

	return {
		storyGroups,
		ownStoryGroup,
		loadingStories,
		creatingStory,
		refreshStories,
		createStory,
		markStoryAsSeen,
		deleteStory,
		getStoryViewers,
		reactToStory,
		commentOnStory,
	};
};

export default useStories;
