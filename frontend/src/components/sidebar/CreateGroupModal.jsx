import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HiMagnifyingGlass, HiOutlineUserGroup, HiOutlineXMark } from "react-icons/hi2";
import useModalBodyScrollLock from "../../hooks/useModalBodyScrollLock";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const CreateGroupModal = ({ open, onClose, onCreated }) => {
	const [users, setUsers] = useState([]);
	const [loadingUsers, setLoadingUsers] = useState(false);
	const [creatingGroup, setCreatingGroup] = useState(false);
	const [searchValue, setSearchValue] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [memberLimit, setMemberLimit] = useState("");
	const [isPrivate, setIsPrivate] = useState(false);
	const [selectedMemberIds, setSelectedMemberIds] = useState([]);
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
	}, [open, onClose]);

	useEffect(() => {
		if (!open) return;

		const loadUsers = async () => {
			setLoadingUsers(true);
			try {
				const res = await fetch("/api/users/selectable?scope=contacts");
				const data = await res.json();
				if (!res.ok) {
					throw new Error(data.error || "Failed to load users");
				}
				setUsers(Array.isArray(data) ? data : []);
			} catch (error) {
				toast.error(error.message);
			} finally {
				setLoadingUsers(false);
			}
		};

		void loadUsers();
	}, [open]);

	useEffect(() => {
		if (!open) {
			setSearchValue("");
			setTitle("");
			setDescription("");
			setMemberLimit("");
			setIsPrivate(false);
			setSelectedMemberIds([]);
		}
	}, [open]);

	const filteredUsers = useMemo(() => {
		const normalizedSearch = searchValue.trim().toLowerCase();
		if (!normalizedSearch) return users;

		return users.filter((user) =>
			[user.fullName, user.username, user.bio]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedSearch))
		);
	}, [searchValue, users]);
	const selectedMemberIdSet = useMemo(() => new Set(selectedMemberIds), [selectedMemberIds]);

	const toggleMember = (userId) => {
		setSelectedMemberIds((currentIds) =>
			currentIds.includes(userId)
				? currentIds.filter((currentId) => currentId !== userId)
				: [...currentIds, userId]
		);
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		if (!title.trim()) {
			toast.error("Group name is required");
			return;
		}

		if (selectedMemberIds.length === 0) {
			toast.error("Select at least one member");
			return;
		}

		setCreatingGroup(true);
		try {
			const res = await fetch("/api/conversations/groups", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					title: title.trim(),
					description: description.trim(),
					isPrivate,
					memberLimit: memberLimit.trim(),
					memberIds: selectedMemberIds,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || "Failed to create group");
			}

			toast.success("Group created");
			onCreated?.(data);
			onClose();
		} catch (error) {
			toast.error(error.message);
		} finally {
			setCreatingGroup(false);
		}
	};

	if (!open) return null;

	return (
		<div
			className='fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/78 p-3 sm:p-5'
			onClick={onClose}
		>
			<div
				className='flex h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(10,18,36,0.96))] shadow-[0_32px_80px_rgba(2,6,23,0.55)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='shrink-0 border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6'>
					<div className='flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/75'>Create group</p>
							<h2 className='mt-2 text-2xl font-semibold text-white sm:text-[2rem]'>Start a new group chat</h2>
							<p className='mt-2 max-w-2xl text-sm leading-6 text-slate-400'>
								Choose who joins, set a member limit, and decide if the group is private.
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

				<form className='flex min-h-0 flex-1 flex-col' onSubmit={handleSubmit}>
					<div className='custom-scrollbar modal-scroll-region min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6'>
						<div className='space-y-5'>
							<div className='grid gap-4 md:grid-cols-2'>
								<label className='block'>
									<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Group name</span>
									<input
										type='text'
										value={title}
										onChange={(event) => setTitle(event.target.value)}
										placeholder='Night crew'
										className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
									/>
								</label>

								<label className='block'>
									<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Member limit</span>
									<input
										type='number'
										min='2'
										value={memberLimit}
										onChange={(event) => setMemberLimit(event.target.value)}
										placeholder='Optional'
										className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
									/>
								</label>
							</div>

							<label className='block'>
								<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Description</span>
								<textarea
									rows='3'
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									placeholder='What is this group about?'
									className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
								/>
							</label>

							<label className='flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4'>
								<div>
									<p className='text-sm font-medium text-slate-100'>Private group</p>
									<p className='mt-1 text-xs leading-5 text-slate-400'>Only invited members will have access.</p>
								</div>
								<input
									type='checkbox'
									checked={isPrivate}
									onChange={(event) => setIsPrivate(event.target.checked)}
									className='toggle toggle-info shrink-0'
								/>
							</label>

							<div className='rounded-[28px] border border-white/10 bg-white/[0.02] p-4 sm:p-5'>
								<div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
									<div className='min-w-0'>
										<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Members</p>
										<p className='mt-1 text-sm text-slate-300'>
											{selectedMemberIds.length} selected
											{memberLimit.trim() ? ` / ${memberLimit.trim()} max` : ""}
										</p>
									</div>
									<div className='relative w-full md:max-w-sm'>
										<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
										<input
											type='text'
											value={searchValue}
											onChange={(event) => setSearchValue(event.target.value)}
											placeholder='Search users'
											className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
										/>
									</div>
								</div>

								<div className='mt-4 space-y-2'>
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
											const isSelected = selectedMemberIdSet.has(user._id);
											const avatarSrc = getAvatarUrl(user.profilePic, 72) || getConversationFallbackAvatar(user);

											return (
												<button
													key={user._id}
													type='button'
													onClick={() => toggleMember(user._id)}
													className={`modal-member-row flex w-full items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition-colors duration-150 ${
														isSelected
															? "border-sky-300/30 bg-sky-500/10"
															: "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
													}`}
												>
													<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
														<img
															src={avatarSrc}
															alt={user.fullName}
															loading='lazy'
															decoding='async'
															className='h-full w-full object-cover'
														/>
													</div>
													<div className='min-w-0 flex-1'>
														<p className='truncate text-sm font-medium text-slate-100'>{user.fullName}</p>
														<p className='truncate text-xs text-slate-400'>@{user.username}</p>
													</div>
													<div
														className={`inline-flex h-7 min-w-[54px] items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${
															isSelected
																? "border-sky-300/30 bg-sky-500/18 text-sky-100"
																: "border-white/10 text-slate-500"
														}`}
													>
														{isSelected ? "Added" : "Add"}
													</div>
												</button>
											);
										})
									)}
								</div>
							</div>
						</div>
					</div>

						<div className='shrink-0 border-t border-white/10 bg-slate-950/70 px-5 py-4 sm:px-6'>
							<div className='flex flex-col gap-3 sm:flex-row sm:justify-end'>
								<button
									type='button'
									className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
									onClick={onClose}
								>
									Cancel
								</button>
								<button
									type='submit'
									className='inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
									disabled={creatingGroup}
								>
									<HiOutlineUserGroup className='h-5 w-5' />
									{creatingGroup ? "Creating..." : "Create group"}
								</button>
							</div>
						</div>
				</form>
			</div>
		</div>
	);
};

export default CreateGroupModal;
