import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuthContext } from "../context/AuthContext";
import { useSocketContext } from "../context/SocketContext";

const STORIES_REFRESH_INTERVAL_MS = 35000;
const STORY_SOCKET_REFRESH_DEBOUNCE_MS = 600;

const getUserId = (user) => user?._id || user?.id || null;

const normalizeStoryGroups = (payload) => {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.stories)) return payload.stories;
	return [];
};

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

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (socketRefreshTimeoutRef.current) {
				clearTimeout(socketRefreshTimeoutRef.current);
			}
		};
	}, []);

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

				const nextStoryGroups = sortStoryGroups(normalizeStoryGroups(data), authUserId);
				if (!isMountedRef.current) return;
				setStoryGroups(nextStoryGroups);
				return nextStoryGroups;
			} catch (error) {
				if (!silent && isMountedRef.current) {
					toast.error(error.message);
				}
				return [];
			} finally {
				inFlightRef.current = false;
				if (!silent && isMountedRef.current) {
					setLoadingStories(false);
				}
			}
		},
		[authUserId]
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
		async ({ text = "", file = null } = {}) => {
			const normalizedText = typeof text === "string" ? text.trim() : "";
			if (!normalizedText && !file) {
				toast.error("Add text, image, or video");
				return { ok: false };
			}

			setCreatingStory(true);
			try {
				const formData = new FormData();
				if (normalizedText) {
					formData.append("text", normalizedText);
				}
				if (file) {
					formData.append("storyMedia", file, file.name || "story");
				}

				const res = await fetch("/api/stories", {
					method: "POST",
					body: formData,
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok) {
					throw new Error(data?.error || "Failed to post story");
				}

				toast.success("Story posted");
				await refreshStories({ silent: true });
				return { ok: true, data };
			} catch (error) {
				toast.error(error.message);
				return { ok: false, error };
			} finally {
				setCreatingStory(false);
			}
		},
		[refreshStories]
	);

	const markStoryAsSeen = useCallback(async (storyId) => {
		if (!storyId) return;

		setStoryGroups((currentGroups) =>
			currentGroups.map((group) => {
				if (!Array.isArray(group?.stories)) return group;

				const nextStories = group.stories.map((story) =>
					story?._id === storyId
						? {
								...story,
								isSeen: true,
						  }
						: story
				);
				return normalizeGroupShape({ ...group, stories: nextStories });
			})
		);

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
				toast.error(error.message);
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
			toast.error(error.message);
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
			toast.error(error.message);
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
			toast.error(error.message);
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
