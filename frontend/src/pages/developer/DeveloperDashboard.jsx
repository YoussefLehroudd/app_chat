import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
	IoArchiveOutline,
	IoArrowBack,
	IoBarChartOutline,
	IoChatbubbleEllipsesOutline,
	IoCodeSlashOutline,
	IoFlashOutline,
	IoLockClosedOutline,
	IoPeopleOutline,
	IoRefreshOutline,
	IoShieldCheckmarkOutline,
	IoTrashOutline,
} from "react-icons/io5";
import { useAuthContext } from "../../context/AuthContext";
import formatLastSeen from "../../utils/lastSeen";
import { extractTime } from "../../utils/extractTime";
import VerifiedBadge from "../../components/common/VerifiedBadge";

const statCards = [
	{ id: "totalUsers", label: "Users", icon: IoPeopleOutline },
	{ id: "developerCount", label: "Developers", icon: IoShieldCheckmarkOutline },
	{ id: "archivedCount", label: "Archived", icon: IoArchiveOutline },
	{ id: "bannedCount", label: "Banned", icon: IoLockClosedOutline },
	{ id: "conversationCount", label: "Conversations", icon: IoBarChartOutline },
	{ id: "messageCount", label: "Messages", icon: IoChatbubbleEllipsesOutline },
];

const fetchJson = async (url, options = {}) => {
	const response = await fetch(url, options);
	const data = await response.json();

	if (!response.ok || data.error) {
		throw new Error(data.error || "Request failed");
	}

	return data;
};

const getMessagePreview = (message) => {
	if (!message) return "Empty message";
	return message.audio ? "Audio message" : message.message?.trim() || "Empty message";
};

const DeveloperDashboard = () => {
	const { authUser } = useAuthContext();
	const [overview, setOverview] = useState({
		totals: {
			totalUsers: 0,
			developerCount: 0,
			archivedCount: 0,
			bannedCount: 0,
			conversationCount: 0,
			messageCount: 0,
			newUsersThisWeek: 0,
		},
		latestUsers: [],
	});
	const [users, setUsers] = useState([]);
	const [messages, setMessages] = useState([]);
	const [searchValue, setSearchValue] = useState("");
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [actionKey, setActionKey] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [modalState, setModalState] = useState(null);

	const loadDashboard = async ({ silent = false } = {}) => {
		if (silent) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}

		try {
			setErrorMessage("");
			const [overviewData, usersData, messagesData] = await Promise.all([
				fetchJson("/api/developer/overview"),
				fetchJson("/api/developer/users"),
				fetchJson("/api/developer/messages?limit=18"),
			]);

			setOverview(overviewData);
			setUsers(usersData);
			setMessages(messagesData);
		} catch (error) {
			setErrorMessage(error.message || "Unable to load developer dashboard");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	useEffect(() => {
		loadDashboard();
	}, []);

	useEffect(() => {
		if (!modalState) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape" && !actionKey) {
				setModalState(null);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [actionKey, modalState]);

	const filteredUsers = useMemo(() => {
		const normalizedQuery = searchValue.trim().toLowerCase();
		if (!normalizedQuery) return users;

		return users.filter((user) =>
			[
				user.fullName,
				user.username,
				user.role,
				user.bio,
				user.bannedReason,
				user.isBanned ? "banned" : "active",
				user.isArchived ? "archived" : "live",
				user.isVerified ? "verified" : "standard",
			]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedQuery))
		);
	}, [searchValue, users]);

	const handleRefresh = async () => {
		await loadDashboard({ silent: true });
	};

	const handleRoleChange = async (user, nextRole) => {
		setActionKey(`role-${user._id}`);

		try {
			const data = await fetchJson(`/api/developer/users/${user._id}/role`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: nextRole }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const handleArchiveToggle = async (user, shouldArchive) => {
		setActionKey(`archive-user-${user._id}`);

		try {
			const data = await fetchJson(`/api/developer/users/${user._id}/archive`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isArchived: shouldArchive }),
			});
			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleBanToggle = async (user, shouldBan, reason = "") => {
		setActionKey(`ban-${user._id}`);

		try {
			const data = await fetchJson(`/api/developer/users/${user._id}/ban`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isBanned: shouldBan, reason }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const handleVerificationToggle = async (user, shouldVerify) => {
		setActionKey(`verify-${user._id}`);

		try {
			const data = await fetchJson(`/api/developer/users/${user._id}/verify`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isVerified: shouldVerify }),
			});

			setUsers((currentUsers) =>
				currentUsers.map((currentUser) =>
					currentUser._id === user._id ? { ...currentUser, ...data.user } : currentUser
				)
			);
			await loadDashboard({ silent: true });
			toast.success(data.message);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setActionKey("");
		}
	};

	const handleDeleteMessage = async (messageId) => {
		setActionKey(`delete-message-${messageId}`);

		try {
			const data = await fetchJson(`/api/developer/messages/${messageId}`, {
				method: "DELETE",
			});
			setMessages((currentMessages) => currentMessages.filter((message) => message._id !== messageId));
			await loadDashboard({ silent: true });
			toast.success(data.message);
			return true;
		} catch (error) {
			toast.error(error.message);
			return false;
		} finally {
			setActionKey("");
		}
	};

	const openArchiveModal = (user) => {
		setModalState({
			type: "archive-user",
			user,
			shouldArchive: !user.isArchived,
		});
	};

	const openBanModal = (user) => {
		setModalState({
			type: "ban-user",
			user,
			shouldBan: !user.isBanned,
			reason: user.bannedReason || "",
		});
	};

	const openDeleteMessageModal = (message) => {
		setModalState({ type: "delete-message", message });
	};

	const closeModal = () => {
		if (actionKey) return;
		setModalState(null);
	};

	const updateModalReason = (value) => {
		setModalState((currentModal) =>
			currentModal?.type === "ban-user"
				? {
						...currentModal,
						reason: value,
				  }
				: currentModal
		);
	};

	const handleModalConfirm = async () => {
		if (!modalState) return;

		let succeeded = false;

		if (modalState.type === "archive-user") {
			succeeded = await handleArchiveToggle(modalState.user, modalState.shouldArchive);
		}

		if (modalState.type === "ban-user") {
			succeeded = await handleBanToggle(
				modalState.user,
				modalState.shouldBan,
				(modalState.reason || "").trim()
			);
		}

		if (modalState.type === "delete-message") {
			succeeded = await handleDeleteMessage(modalState.message._id);
		}

		if (succeeded) {
			setModalState(null);
		}
	};

	const shellCardClassName =
		"relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,14,28,0.92),rgba(8,15,30,0.7))] shadow-[0_28px_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl";
	const panelClassName =
		"relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:p-6 lg:p-7";
	const modalActionKey =
		modalState?.type === "archive-user"
			? `archive-user-${modalState.user._id}`
			: modalState?.type === "ban-user"
				? `ban-${modalState.user._id}`
				: modalState?.type === "delete-message"
					? `delete-message-${modalState.message._id}`
					: "";
	const isModalBusy = Boolean(modalActionKey && actionKey === modalActionKey);

	return (
		<div className='relative flex h-full min-h-0 w-full flex-1 overflow-hidden'>
			<div className='pointer-events-none absolute inset-0 overflow-hidden'>
				<div className='absolute left-[-10%] top-[-14%] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl'></div>
				<div className='absolute bottom-[-18%] right-[-10%] h-96 w-96 rounded-full bg-orange-400/10 blur-3xl'></div>
				<div className='absolute left-[48%] top-[26%] h-52 w-52 rounded-full bg-sky-300/8 blur-3xl'></div>
			</div>

			<div className='relative mx-auto flex h-full w-full max-w-[1680px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6'>
				<div className={`${shellCardClassName} flex h-full min-h-0 flex-col p-3 sm:p-4 lg:p-5`}>
					<div className='pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/35 to-transparent'></div>

					<div className='custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pr-1'>
						<div className='flex flex-col gap-3 rounded-[26px] border border-white/8 bg-white/[0.03] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-6'>
							<div className='max-w-2xl'>
								<div className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-200'>
									<IoCodeSlashOutline className='h-4 w-4' />
									Developer control
								</div>
								<h1 className='mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl'>
									Operate the entire chat app
								</h1>
								<p className='mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-[15px]'>
									Review platform totals, promote trusted accounts, ban abusive users, moderate messages,
									and archive or restore accounts without losing their history.
								</p>
							</div>

							<div className='flex flex-wrap items-center gap-3'>
								<button
									type='button'
									onClick={handleRefresh}
									className='inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08]'
								>
									<IoRefreshOutline className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
									Refresh
								</button>
								<Link
									to='/'
									className='inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08]'
								>
									<IoArrowBack className='h-4 w-4' />
									Back to chats
								</Link>
							</div>
						</div>

						{errorMessage ? (
							<div className='mt-4 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100'>
								{errorMessage}
							</div>
						) : null}

						<div className='mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_420px]'>
							<div className='space-y-4'>
								<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-6'>
									{statCards.map(({ id, label, icon: Icon }) => (
										<div
											key={id}
											className='rounded-[26px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_18px_44px_rgba(2,6,23,0.22)]'
										>
											<div className='inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-200'>
												<Icon className='h-5 w-5' />
											</div>
											<p className='mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
												{label}
											</p>
											<p className='mt-2 text-3xl font-semibold text-white'>
												{loading ? "..." : overview.totals[id]}
											</p>
										</div>
									))}
								</div>

								<div className={panelClassName}>
									<div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
										<div>
											<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>
												User control
											</p>
											<h2 className='mt-2 text-2xl font-semibold text-white'>Manage accounts and roles</h2>
											<p className='mt-2 max-w-2xl text-sm leading-7 text-slate-400'>
												Promote trusted users to developer, ban or unban access when needed, or archive
												accounts while preserving their conversations and messages.
											</p>
										</div>

										<input
											type='text'
											value={searchValue}
											onChange={(event) => setSearchValue(event.target.value)}
											placeholder='Search users'
											className='h-12 w-full rounded-[18px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55 lg:max-w-[280px]'
										/>
									</div>

									<div className='mt-5 space-y-3'>
										{filteredUsers.map((user) => {
											const isCurrentUser = user._id === authUser?._id;
											const isProtectedPrimary = user.isPrimaryDeveloper && !authUser?.isPrimaryDeveloper;
											const roleActionLabel = user.role === "DEVELOPER" ? "Set as user" : "Make developer";
											const nextRole = user.role === "DEVELOPER" ? "USER" : "DEVELOPER";
											const isBusy =
												actionKey === `role-${user._id}` ||
												actionKey === `verify-${user._id}` ||
												actionKey === `ban-${user._id}` ||
												actionKey === `archive-user-${user._id}`;

											return (
												<div
													key={user._id}
													className={`rounded-[24px] border p-4 transition hover:bg-white/[0.04] ${
														user.isArchived
															? "border-amber-300/20 bg-amber-400/[0.05] hover:border-amber-300/30"
															: user.isBanned
															? "border-rose-400/20 bg-rose-500/[0.045] hover:border-rose-400/30"
															: "border-white/8 bg-white/[0.025] hover:border-white/12"
													}`}
												>
													<div className='flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between'>
														<div className='min-w-0'>
															<div className='flex flex-wrap items-center gap-2'>
																<p className='truncate text-lg font-semibold text-white'>{user.fullName}</p>
																<span
																	className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
																		user.role === "DEVELOPER"
																			? "border border-sky-300/30 bg-sky-400/12 text-sky-100"
																			: "border border-white/10 bg-white/[0.05] text-slate-300"
																	}`}
																>
																	{user.role}
																</span>
																{isCurrentUser ? (
																	<span className='rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200'>
																		You
																	</span>
																) : null}
																{user.isBanned ? (
																	<span className='rounded-full border border-rose-400/25 bg-rose-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100'>
																		BANNED
																	</span>
																) : null}
																<VerifiedBadge user={user} showLabel compact />
																{user.isArchived ? (
																	<span className='rounded-full border border-amber-300/25 bg-amber-400/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
																		ARCHIVED
																	</span>
																) : null}
																{user.isPrimaryDeveloper ? (
																	<span className='rounded-full border border-amber-300/25 bg-amber-400/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
																		PRIMARY
																	</span>
																) : null}
															</div>
															<p className='mt-1 text-sm text-slate-400'>@{user.username}</p>
															<div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500'>
																<span>{user.sentMessageCount} sent messages</span>
																<span>{user.conversationCount} conversations</span>
																<span>{formatLastSeen(user.lastSeen)}</span>
															</div>
															{user.isBanned ? (
																<p className='mt-3 text-sm text-rose-100'>
																	{user.bannedReason || "No reason provided"}
																</p>
															) : null}
															{user.isArchived ? (
																<p className='mt-3 text-sm text-amber-100'>
																	Stored in archive. Profile, conversations, and messages are preserved.
																</p>
															) : null}
															{isProtectedPrimary ? (
																<p className='mt-3 text-sm text-amber-100'>
																	This primary developer account is protected from other developers.
																</p>
															) : null}
														</div>

														<div className='flex flex-wrap items-center gap-2'>
															<button
																type='button'
																disabled={isCurrentUser || isProtectedPrimary || isBusy}
																onClick={() => handleRoleChange(user, nextRole)}
																className='inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50'
															>
																{actionKey === `role-${user._id}` ? "Updating..." : roleActionLabel}
															</button>
															<button
																type='button'
																disabled={isProtectedPrimary || isBusy}
																onClick={() => handleVerificationToggle(user, !user.isVerified)}
																className={`inline-flex items-center justify-center rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
																	user.isVerified
																		? "border-slate-200/15 bg-white/[0.05] text-slate-100 hover:bg-white/[0.08]"
																		: "border-sky-300/20 bg-sky-500/10 text-sky-100 hover:bg-sky-500/16"
																}`}
															>
																{actionKey === `verify-${user._id}`
																	? user.isVerified
																		? "Removing..."
																		: "Applying..."
																	: user.isVerified
																		? "Remove badge"
																		: "Give verified"}
															</button>
															<button
																type='button'
																disabled={isCurrentUser || isProtectedPrimary || isBusy}
																onClick={() => openBanModal(user)}
																className={`inline-flex items-center justify-center rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
																	user.isBanned
																		? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/16"
																		: "border-amber-300/20 bg-amber-400/10 text-amber-100 hover:bg-amber-400/16"
																}`}
															>
																{actionKey === `ban-${user._id}`
																	? user.isBanned
																		? "Removing..."
																		: "Banning..."
																	: user.isBanned
																		? "Remove ban"
																		: "Ban user"}
															</button>
															<button
																type='button'
																disabled={isCurrentUser || isProtectedPrimary || isBusy}
																onClick={() => openArchiveModal(user)}
																className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
																	user.isArchived
																		? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/16"
																		: "border-rose-400/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/16"
																}`}
															>
																{user.isArchived ? <IoArchiveOutline className='h-4 w-4' /> : <IoTrashOutline className='h-4 w-4' />}
																{actionKey === `archive-user-${user._id}`
																	? user.isArchived
																		? "Restoring..."
																		: "Archiving..."
																	: user.isArchived
																		? "Restore user"
																		: "Archive user"}
															</button>
														</div>
													</div>
												</div>
											);
										})}

										{!loading && filteredUsers.length === 0 ? (
											<div className='rounded-[24px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-6 text-sm text-slate-400'>
												No users match this search.
											</div>
										) : null}
									</div>
								</div>
							</div>

							<div className='space-y-4'>
								<div className={panelClassName}>
									<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>
										Recent signups
									</p>
									<h2 className='mt-2 text-2xl font-semibold text-white'>
										{overview.totals.newUsersThisWeek} new this week
									</h2>

									<div className='mt-5 space-y-3'>
										{overview.latestUsers.map((user) => (
											<div
												key={user._id}
												className='rounded-[22px] border border-white/8 bg-white/[0.025] px-4 py-3'
											>
													<div className='flex items-center justify-between gap-3'>
														<div className='min-w-0'>
															<div className='flex flex-wrap items-center gap-2'>
																<p className='truncate text-sm font-semibold text-white'>{user.fullName}</p>
																<VerifiedBadge user={user} compact />
															</div>
															<p className='mt-1 truncate text-xs text-slate-400'>@{user.username}</p>
														</div>
														<div className='flex flex-wrap items-center gap-2'>
															<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300'>
																{user.role}
															</span>
															<VerifiedBadge user={user} showLabel compact />
															{user.isBanned ? (
																<span className='rounded-full border border-rose-400/25 bg-rose-500/12 px-3 py-1 text-[11px] font-medium text-rose-100'>
																	Banned
																</span>
														) : null}
														{user.isArchived ? (
															<span className='rounded-full border border-amber-300/25 bg-amber-400/12 px-3 py-1 text-[11px] font-medium text-amber-100'>
																Archived
															</span>
														) : null}
														{user.isPrimaryDeveloper ? (
															<span className='rounded-full border border-amber-300/25 bg-amber-400/12 px-3 py-1 text-[11px] font-medium text-amber-100'>
																Primary
															</span>
														) : null}
													</div>
												</div>
											</div>
										))}
									</div>
								</div>

								<div className={panelClassName}>
									<div className='flex items-start justify-between gap-3'>
										<div>
											<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>
												Message moderation
											</p>
											<h2 className='mt-2 text-2xl font-semibold text-white'>Recent messages</h2>
										</div>
										<div className='rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100'>
											<IoFlashOutline className='mr-1 inline h-3.5 w-3.5' />
											Live moderation
										</div>
									</div>

									<div className='mt-5 space-y-3'>
										{messages.map((message) => {
											const preview = getMessagePreview(message);
											const isBusy = actionKey === `delete-message-${message._id}`;

											return (
												<div
													key={message._id}
													className='rounded-[22px] border border-white/8 bg-white/[0.025] p-4'
												>
													<div className='flex items-start justify-between gap-3'>
														<div className='min-w-0 flex-1'>
															<p className='text-sm font-semibold text-white [overflow-wrap:anywhere] break-words'>
																{message.sender?.fullName || "Unknown"}
																{" -> "}
																{message.receiver?.fullName || "Unknown"}
															</p>
															<p className='mt-1 text-xs text-slate-500 [overflow-wrap:anywhere] break-words'>
																{extractTime(message.createdAt)} · {message.sender?.username || "unknown"} to{" "}
																{message.receiver?.username || "unknown"}
															</p>
														</div>
														<button
															type='button'
															disabled={isBusy}
															onClick={() => openDeleteMessageModal(message)}
															className='inline-flex items-center justify-center rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-50'
														>
															{isBusy ? "Deleting..." : "Delete"}
														</button>
													</div>
													<p className='mt-3 text-sm leading-6 text-slate-300 [overflow-wrap:anywhere] break-words whitespace-pre-wrap'>
														{preview}
													</p>
												</div>
											);
										})}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{modalState ? (
				<div className='absolute inset-0 z-30 flex items-center justify-center bg-slate-950/72 px-4 backdrop-blur-md'>
					<div className='w-full max-w-xl rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.94))] p-6 shadow-[0_28px_90px_rgba(2,6,23,0.6)] sm:p-7'>
						<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500'>
							{modalState.type === "archive-user"
								? modalState.shouldArchive
									? "Archive account"
									: "Restore account"
								: modalState.type === "ban-user"
									? modalState.shouldBan
										? "Ban account"
										: "Restore account"
									: "Message deletion"}
						</p>

						<h3 className='mt-3 text-2xl font-semibold text-white'>
							{modalState.type === "archive-user"
								? modalState.shouldArchive
									? `Archive ${modalState.user.fullName}?`
									: `Restore ${modalState.user.fullName}?`
								: modalState.type === "ban-user"
									? modalState.shouldBan
										? `Ban ${modalState.user.fullName}?`
										: `Remove ban from ${modalState.user.fullName}?`
									: "Delete this message?"}
						</h3>

						<p className='mt-3 text-sm leading-7 text-slate-400'>
							{modalState.type === "archive-user"
								? modalState.shouldArchive
									? `This moves @${modalState.user.username} to archive. Conversations, messages, and profile data stay saved and can be restored later.`
									: modalState.user.isBanned
										? `This restores @${modalState.user.username} from archive, but the ban will still stay active until you remove it.`
										: `This restores @${modalState.user.username} and makes the account visible in the app again.`
								: modalState.type === "ban-user"
									? modalState.shouldBan
										? `This blocks @${modalState.user.username} from logging in and disconnects any active session.`
										: `This restores access for @${modalState.user.username}.`
									: getMessagePreview(modalState.message)}
						</p>

						{modalState.type === "ban-user" && modalState.shouldBan ? (
							<div className='mt-5'>
								<label className='mb-2 block text-sm font-medium text-slate-200'>Optional reason</label>
								<textarea
									rows='4'
									value={modalState.reason}
									onChange={(event) => updateModalReason(event.target.value)}
									placeholder='Visible only inside the developer console'
									className='custom-scrollbar min-h-[132px] w-full rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/60'
								/>
								<p className='mt-2 text-xs text-slate-500'>Saved for developer moderation only.</p>
							</div>
						) : null}

						<div className='mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
							<button
								type='button'
								onClick={closeModal}
								disabled={isModalBusy}
								className='inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50'
							>
								Cancel
							</button>
							<button
								type='button'
								onClick={handleModalConfirm}
								disabled={isModalBusy}
								className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
									(modalState.type === "archive-user" && !modalState.shouldArchive) ||
									(modalState.type === "ban-user" && !modalState.shouldBan)
										? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_16px_34px_rgba(16,185,129,0.28)] hover:from-emerald-400 hover:to-teal-400"
										: "bg-gradient-to-r from-rose-500 to-orange-500 shadow-[0_16px_34px_rgba(244,63,94,0.28)] hover:from-rose-400 hover:to-orange-400"
								}`}
							>
								{isModalBusy
									? "Processing..."
									: modalState.type === "archive-user"
										? modalState.shouldArchive
											? "Archive user"
											: "Restore user"
										: modalState.type === "ban-user"
											? modalState.shouldBan
												? "Ban user"
												: "Remove ban"
											: "Delete message"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
};

export default DeveloperDashboard;
