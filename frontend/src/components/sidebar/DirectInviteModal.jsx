import { useEffect, useMemo, useState } from "react";
import { HiMagnifyingGlass, HiOutlineUserPlus, HiOutlineXMark } from "react-icons/hi2";
import useModalBodyScrollLock from "../../hooks/useModalBodyScrollLock";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const normalizeText = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const DirectInviteModal = ({
	open,
	onClose,
	onSendInvitation,
	isSendingToUser,
	connectedUserIds,
	pendingCounterpartIds,
}) => {
	const [users, setUsers] = useState([]);
	const [searchValue, setSearchValue] = useState("");
	const [loadingUsers, setLoadingUsers] = useState(false);
	useModalBodyScrollLock(open);

	useEffect(() => {
		if (!open) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose, open]);

	useEffect(() => {
		if (!open) return;

		let isCancelled = false;
		const loadUsers = async () => {
			setLoadingUsers(true);
			try {
				const response = await fetch("/api/users/selectable");
				const data = await response.json().catch(() => null);
				if (!response.ok || data?.error) {
					throw new Error(data?.error || "Failed to load users");
				}

				if (isCancelled) return;
				setUsers(Array.isArray(data) ? data : []);
			} catch {
				if (!isCancelled) {
					setUsers([]);
				}
			} finally {
				if (!isCancelled) {
					setLoadingUsers(false);
				}
			}
		};

		void loadUsers();
		return () => {
			isCancelled = true;
		};
	}, [open]);

	useEffect(() => {
		if (!open) {
			setSearchValue("");
		}
	}, [open]);

	const filteredUsers = useMemo(() => {
		const normalizedSearch = normalizeText(searchValue);
		if (!normalizedSearch) return users;

		return users.filter((user) =>
			[user?.fullName, user?.username, user?.bio]
				.filter(Boolean)
				.some((value) => normalizeText(value).includes(normalizedSearch))
		);
	}, [searchValue, users]);

	const getUserState = (userId) => {
		if (!userId) return "UNAVAILABLE";
		if (connectedUserIds?.has(userId)) return "CONNECTED";
		if (pendingCounterpartIds?.has(userId)) return "PENDING";
		return "AVAILABLE";
	};

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-[175] flex items-center justify-center bg-slate-950/80 p-3 sm:p-5'
			onClick={onClose}
		>
			<div
				className='flex h-[min(90vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(10,18,36,0.96))] shadow-[0_32px_80px_rgba(2,6,23,0.55)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='shrink-0 border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6'>
					<div className='flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/75'>Direct invitations</p>
							<h2 className='mt-2 text-2xl font-semibold text-white sm:text-[2rem]'>Invite users to chat</h2>
							<p className='mt-2 max-w-2xl text-sm leading-6 text-slate-400'>
								Send an invitation. You can start chatting only after the user accepts.
							</p>
						</div>
						<button
							type='button'
							className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08] hover:text-white'
							onClick={onClose}
						>
							<HiOutlineXMark className='h-5 w-5' />
						</button>
					</div>
				</div>

				<div className='min-h-0 flex-1 px-5 py-5 sm:px-6 sm:py-6'>
					<div className='relative'>
						<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
						<input
							type='text'
							value={searchValue}
							onChange={(event) => setSearchValue(event.target.value)}
							placeholder='Search users'
							className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
						/>
					</div>

					<div className='custom-scrollbar modal-scroll-region mt-4 h-full space-y-2 overflow-y-auto pb-2'>
						{loadingUsers ? (
							<div className='rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400'>
								Loading users...
							</div>
						) : filteredUsers.length === 0 ? (
							<div className='rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400'>
								No users found.
							</div>
						) : (
							filteredUsers.map((user) => {
								const userId = user?._id || user?.id || null;
								const avatarSrc = getAvatarUrl(user?.profilePic, 72) || getConversationFallbackAvatar(user);
								const userState = getUserState(userId);
								const isSending = isSendingToUser(userId);
								const canSendInvite = userState === "AVAILABLE" && !isSending;

								return (
									<div
										key={userId || user?.username || user?.fullName}
										className='flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.03] px-3 py-3'
									>
										<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
											<img
												src={avatarSrc}
												alt={user?.fullName || "User"}
												loading='lazy'
												decoding='async'
												className='h-full w-full object-cover'
											/>
										</div>
										<div className='min-w-0 flex-1'>
											<p className='truncate text-sm font-medium text-slate-100'>{user?.fullName || "User"}</p>
											<p className='truncate text-xs text-slate-400'>@{user?.username || "unknown"}</p>
										</div>
										{userState === "CONNECTED" ? (
											<span className='rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100'>
												Connected
											</span>
										) : userState === "PENDING" ? (
											<span className='rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100'>
												Pending
											</span>
										) : (
											<button
												type='button'
												disabled={!canSendInvite}
												onClick={() => {
													if (!userId) return;
													void onSendInvitation(userId);
												}}
												className='inline-flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-sky-500/14 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/45 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60'
											>
												<HiOutlineUserPlus className='h-3.5 w-3.5' />
												{isSending ? "Sending..." : "Invite"}
											</button>
										)}
									</div>
								);
							})
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default DirectInviteModal;
