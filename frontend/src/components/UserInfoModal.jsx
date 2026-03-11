import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
	HiMagnifyingGlass,
	HiOutlineArrowLeftOnRectangle,
	HiOutlineCamera,
	HiOutlinePencilSquare,
	HiOutlineTrash,
	HiOutlineUserMinus,
	HiOutlineUserPlus,
} from "react-icons/hi2";
import { useAuthContext } from "../context/AuthContext";
import useConversation from "../zustand/useConversation";
import getConversationFallbackAvatar from "../utils/conversationAvatar";
import { getAvatarUrl } from "../utils/avatar";
import DeveloperBadge from "./common/DeveloperBadge";
import VerifiedBadge from "./common/VerifiedBadge";

const UserInfoModal = ({ user, open, onClose }) => {
	const { authUser } = useAuthContext();
	const { setSelectedConversation, setMessages, setShowSidebar } = useConversation();
	const isGroupConversation = user?.type === "GROUP";
	const fallbackAvatar = getConversationFallbackAvatar(user);
	const resolvedProfilePic = getAvatarUrl(user?.profilePic, 256);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const [isEditMode, setIsEditMode] = useState(false);
	const [showAddMembers, setShowAddMembers] = useState(false);
	const [showInviteMembers, setShowInviteMembers] = useState(false);
	const [isSavingGroup, setIsSavingGroup] = useState(false);
	const [isLeavingGroup, setIsLeavingGroup] = useState(false);
	const [isDeletingGroup, setIsDeletingGroup] = useState(false);
	const [isJoiningGroup, setIsJoiningGroup] = useState(false);
	const [loadingSelectableUsers, setLoadingSelectableUsers] = useState(false);
	const [updatingMemberAction, setUpdatingMemberAction] = useState(null);
	const [selectableUsers, setSelectableUsers] = useState([]);
	const [memberSearchValue, setMemberSearchValue] = useState("");
	const [groupName, setGroupName] = useState("");
	const [groupDescription, setGroupDescription] = useState("");
	const [groupMemberLimit, setGroupMemberLimit] = useState("");
	const [groupPrivate, setGroupPrivate] = useState(false);
	const [groupImageFile, setGroupImageFile] = useState(null);
	const imgRef = useRef(null);
	const fileInputRef = useRef(null);
	const previewUrlRef = useRef(null);

	const currentGroupMember = useMemo(
		() => user?.members?.find((member) => member._id === authUser?._id) || null,
		[user?.members, authUser?._id]
	);
	const isGroupMember = isGroupConversation && Boolean(currentGroupMember);
	const isGroupOwner = isGroupConversation && currentGroupMember?.memberRole === "OWNER";
	const isGroupAdmin = isGroupConversation && currentGroupMember?.memberRole === "ADMIN";
	const canManageGroup = isGroupOwner || isGroupAdmin;
	const canInviteToGroup = isGroupMember;
	const currentMemberCount = user?.memberCount || user?.members?.length || 0;
	const limitReached = Boolean(user?.memberLimit && currentMemberCount >= user.memberLimit);
	const mustTransferOwnershipBeforeLeaving = isGroupOwner && currentMemberCount > 1;
	const hasPendingMemberAction = Boolean(updatingMemberAction);
	const isMemberActionPending = (action, memberId) => updatingMemberAction === `${action}:${memberId}`;

	const filteredSelectableUsers = useMemo(() => {
		if (!isGroupConversation) return [];

		const existingMemberIds = new Set((user?.members || []).map((member) => member._id));
		const normalizedSearch = memberSearchValue.trim().toLowerCase();

		return selectableUsers.filter((member) => {
			if (existingMemberIds.has(member._id)) return false;
			if (!normalizedSearch) return true;

			return [member.fullName, member.username, member.bio]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedSearch));
		});
	}, [isGroupConversation, memberSearchValue, selectableUsers, user?.members]);

	const applyConversationUpdate = (conversation) => {
		if (!conversation?._id) return;
		setSelectedConversation(conversation);
		window.dispatchEvent(
			new CustomEvent("chat:conversation-restored", {
				detail: { conversation },
			})
		);
	};

	const removeConversationLocally = (conversationId) => {
		setSelectedConversation(null);
		setMessages([]);
		setShowSidebar(true);
		window.dispatchEvent(
			new CustomEvent("chat:conversation-removed", {
				detail: { conversationId },
			})
		);
	};

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
		setAvatarSrc(resolvedProfilePic || fallbackAvatar);
		setAvatarLoaded(!resolvedProfilePic);
	}, [resolvedProfilePic, fallbackAvatar]);

	useEffect(() => {
		const img = imgRef.current;
		if (!img) return;
		if (img.complete && img.naturalWidth > 0) {
			setAvatarLoaded(true);
		}
	}, [avatarSrc]);

	useEffect(() => {
		if (previewUrlRef.current) {
			URL.revokeObjectURL(previewUrlRef.current);
			previewUrlRef.current = null;
		}

		setGroupName(user?.fullName || "");
		setGroupDescription(user?.bio || "");
		setGroupMemberLimit(user?.memberLimit ? String(user.memberLimit) : "");
		setGroupPrivate(Boolean(user?.isPrivate));
		setGroupImageFile(null);
		setIsEditMode(false);
		setShowAddMembers(false);
		setShowInviteMembers(false);
		setMemberSearchValue("");
	}, [user?._id, user?.fullName, user?.bio, user?.memberLimit, user?.isPrivate]);

	useEffect(() => {
		if (
			!open ||
			!isGroupConversation ||
			((!canManageGroup || !showAddMembers) && (!canInviteToGroup || !showInviteMembers))
		) {
			return undefined;
		}

		let isCancelled = false;

		const loadSelectableUsers = async () => {
			setLoadingSelectableUsers(true);
			try {
				const response = await fetch("/api/users/selectable");
				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || "Failed to load users");
				}

				if (!isCancelled) {
					setSelectableUsers(Array.isArray(data) ? data : []);
				}
			} catch (error) {
				if (!isCancelled) {
					toast.error(error.message);
				}
			} finally {
				if (!isCancelled) {
					setLoadingSelectableUsers(false);
				}
			}
		};

		loadSelectableUsers();

		return () => {
			isCancelled = true;
		};
	}, [open, isGroupConversation, canManageGroup, showAddMembers, canInviteToGroup, showInviteMembers]);

	useEffect(() => {
		return () => {
			if (previewUrlRef.current) {
				URL.revokeObjectURL(previewUrlRef.current);
			}
		};
	}, []);

	if (!open || !user) return null;

	const handleGroupImageChange = (event) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (previewUrlRef.current) {
			URL.revokeObjectURL(previewUrlRef.current);
		}

		const nextPreviewUrl = URL.createObjectURL(file);
		previewUrlRef.current = nextPreviewUrl;
		setGroupImageFile(file);
		setAvatarSrc(nextPreviewUrl);
		setAvatarLoaded(true);
	};

	const handleSaveGroup = async (event) => {
		event.preventDefault();
		if (!isGroupConversation || !canManageGroup || isSavingGroup) return;

		if (!groupName.trim()) {
			toast.error("Group name is required");
			return;
		}

		setIsSavingGroup(true);
		try {
			const formData = new FormData();
			formData.append("title", groupName.trim());
			formData.append("description", groupDescription.trim());
			formData.append("memberLimit", groupMemberLimit.trim());
			formData.append("isPrivate", String(groupPrivate));
			if (groupImageFile) {
				formData.append("profilePic", groupImageFile);
			}

			const response = await fetch(`/api/conversations/groups/${user._id}`, {
				method: "PATCH",
				body: formData,
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update group");
			}

			applyConversationUpdate(data);
			setIsEditMode(false);
			toast.success("Group updated");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsSavingGroup(false);
		}
	};

	const handleAddMember = async (memberId) => {
		if (!isGroupConversation || !canManageGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`add:${memberId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/members`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ memberIds: [memberId] }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to add member");
			}

			applyConversationUpdate(data);
			toast.success("Member added");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleRemoveMember = async (memberId) => {
		if (!isGroupConversation || !canManageGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`remove:${memberId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/members/${memberId}`, {
				method: "DELETE",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to remove member");
			}

			applyConversationUpdate(data);
			toast.success("Member removed");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleUpdateMemberRole = async (memberId, role) => {
		if (!isGroupConversation || !canManageGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`role:${memberId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/members/${memberId}/role`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ role }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to update role");
			}

			applyConversationUpdate(data);
			toast.success(
				role === "OWNER"
					? "Ownership transferred"
					: role === "ADMIN"
						? "Member promoted to admin"
						: "Admin changed to member"
			);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleSendInvite = async (recipientId) => {
		if (!isGroupConversation || !canInviteToGroup || hasPendingMemberAction) return;

		setUpdatingMemberAction(`invite:${recipientId}`);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/invitations`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ recipientId }),
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to send invitation");
			}

			toast.success("Invitation sent");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setUpdatingMemberAction(null);
		}
	};

	const handleJoinPublicGroup = async () => {
		if (!isGroupConversation || isGroupMember || user?.isPrivate || isJoiningGroup) return;

		setIsJoiningGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/join`, {
				method: "POST",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to join group");
			}

			applyConversationUpdate(data);
			toast.success("You joined the group");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsJoiningGroup(false);
		}
	};

	const handleLeaveGroup = async () => {
		if (!isGroupConversation || !isGroupMember || isLeavingGroup) return;

		setIsLeavingGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}/leave`, {
				method: "POST",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to leave group");
			}

			removeConversationLocally(user._id);
			onClose();
			toast.success("You left the group");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsLeavingGroup(false);
		}
	};

	const handleDeleteGroup = async () => {
		if (!isGroupOwner || isDeletingGroup) return;

		const shouldDelete = window.confirm("Delete this group for everyone? This action cannot be undone.");
		if (!shouldDelete) return;

		setIsDeletingGroup(true);
		try {
			const response = await fetch(`/api/conversations/groups/${user._id}`, {
				method: "DELETE",
			});
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || "Failed to delete group");
			}

			removeConversationLocally(user._id);
			onClose();
			toast.success("Group deleted");
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIsDeletingGroup(false);
		}
	};

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-md sm:p-5'
			onClick={onClose}
		>
			<div
				className='flex h-[min(90vh,860px)] w-full max-w-xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(10,18,36,0.96))] text-white shadow-[0_32px_80px_rgba(2,6,23,0.55)]'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='shrink-0 border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6'>
					<div className='flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-300/80'>User Info</p>
							<div className='mt-2 flex flex-wrap items-center gap-2'>
								<h2 className='text-2xl font-bold text-slate-50 sm:text-[2rem]'>{user.fullName}</h2>
								{isGroupConversation ? (
									<span className='rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100'>
										{user.isPrivate ? "Private group" : "Group chat"}
									</span>
								) : (
									<>
										<VerifiedBadge user={user} />
										<DeveloperBadge user={user} />
									</>
								)}
							</div>
						</div>
						<button
							type='button'
							className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
							onClick={onClose}
						>
							Close
						</button>
					</div>
				</div>

				<div className='custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6'>
					<div className='space-y-4'>
						<div className='flex justify-center'>
							<div className='relative h-28 w-28 overflow-hidden rounded-full border-4 border-sky-400/30 bg-slate-800 shadow-[0_20px_40px_rgba(14,165,233,0.14)]'>
								<div
									className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
										avatarLoaded ? "opacity-0" : "opacity-100"
									}`}
								></div>
								<img
									ref={imgRef}
									src={avatarSrc}
									alt={`${user.fullName} avatar`}
									className={`h-full w-full object-cover transition-opacity duration-200 ${
										avatarLoaded ? "opacity-100" : "opacity-0"
									}`}
									loading='eager'
									decoding='async'
									fetchpriority='high'
									onLoad={() => setAvatarLoaded(true)}
									onError={() => {
										setAvatarSrc(fallbackAvatar);
										setAvatarLoaded(true);
									}}
								/>
							</div>
						</div>

						{isGroupConversation ? (
							<>
								<div className='grid gap-3 sm:grid-cols-2'>
									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Access</p>
										<p className='mt-1 text-base font-medium text-slate-100'>
											{user.isPrivate ? "Private group" : "Public group"}
										</p>
									</div>

									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Members</p>
										<p className='mt-1 text-base font-medium text-slate-100'>
											{currentMemberCount}
											{user.memberLimit ? ` / ${user.memberLimit} max` : ""}
										</p>
									</div>
								</div>

								<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
									<div className='flex flex-wrap gap-2'>
										{canManageGroup ? (
											<>
												<button
													type='button'
													onClick={() => setIsEditMode((currentValue) => !currentValue)}
													className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16'
												>
													<HiOutlinePencilSquare className='h-4 w-4' />
													{isEditMode ? "Close edit" : "Edit group"}
												</button>
												<button
													type='button'
													onClick={() => setShowAddMembers((currentValue) => !currentValue)}
													className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
													disabled={limitReached}
												>
													<HiOutlineUserPlus className='h-4 w-4' />
													{showAddMembers ? "Hide add" : "Add members"}
												</button>
											</>
										) : null}
										{canInviteToGroup ? (
											<button
												type='button'
												onClick={() => setShowInviteMembers((currentValue) => !currentValue)}
												className='inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/16'
											>
												<HiOutlineUserPlus className='h-4 w-4' />
												{showInviteMembers ? "Hide invites" : "Invite users"}
											</button>
										) : null}
										{isGroupOwner ? (
											<button
												type='button'
												onClick={handleDeleteGroup}
												className='inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
												disabled={isDeletingGroup}
											>
												<HiOutlineTrash className='h-4 w-4' />
												{isDeletingGroup ? "Deleting..." : "Delete group"}
											</button>
										) : null}
										{isGroupMember ? (
											<button
												type='button'
												onClick={handleLeaveGroup}
												className='inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
												disabled={isLeavingGroup || mustTransferOwnershipBeforeLeaving}
											>
												<HiOutlineArrowLeftOnRectangle className='h-4 w-4' />
												{isLeavingGroup
													? "Leaving..."
													: mustTransferOwnershipBeforeLeaving
														? "Transfer owner first"
														: "Leave group"}
											</button>
										) : !user?.isPrivate ? (
											<button
												type='button'
												onClick={handleJoinPublicGroup}
												className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
												disabled={isJoiningGroup}
											>
												<HiOutlineUserPlus className='h-4 w-4' />
												{isJoiningGroup ? "Joining..." : "Join group"}
											</button>
										) : null}
									</div>
									{limitReached ? (
										<p className='mt-3 text-xs text-amber-200/85'>The member limit is already reached for this group.</p>
									) : null}
									{mustTransferOwnershipBeforeLeaving ? (
										<p className='mt-3 text-xs text-amber-200/85'>
											Transfer ownership to another member before leaving this group.
										</p>
									) : null}
								</div>

								{canManageGroup && isEditMode ? (
									<form className='space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4' onSubmit={handleSaveGroup}>
										<div className='grid gap-4 sm:grid-cols-2'>
											<label className='block'>
												<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Group name</span>
												<input
													type='text'
													value={groupName}
													onChange={(event) => setGroupName(event.target.value)}
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</label>
											<label className='block'>
												<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Member limit</span>
												<input
													type='number'
													min='2'
													value={groupMemberLimit}
													onChange={(event) => setGroupMemberLimit(event.target.value)}
													placeholder='Optional'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</label>
										</div>

										<label className='block'>
											<span className='mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Description</span>
											<textarea
												rows='3'
												value={groupDescription}
												onChange={(event) => setGroupDescription(event.target.value)}
												className='custom-scrollbar w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
											/>
										</label>

										<div className='grid gap-4 sm:grid-cols-[1fr_auto]'>
											<label className='flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3.5'>
												<div>
													<p className='text-sm font-medium text-slate-100'>Private group</p>
													<p className='mt-1 text-xs leading-5 text-slate-400'>Toggle between private and public.</p>
												</div>
												<input
													type='checkbox'
													checked={groupPrivate}
													onChange={(event) => setGroupPrivate(event.target.checked)}
													className='toggle toggle-info shrink-0'
												/>
											</label>

											<div className='flex items-end'>
												<input
													ref={fileInputRef}
													type='file'
													accept='image/*'
													onChange={handleGroupImageChange}
													className='hidden'
												/>
												<button
													type='button'
													onClick={() => fileInputRef.current?.click()}
													className='inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]'
												>
													<HiOutlineCamera className='h-4 w-4' />
													{groupImageFile ? "Change photo" : "Upload photo"}
												</button>
											</div>
										</div>

										<div className='flex flex-col gap-3 sm:flex-row sm:justify-end'>
											<button
												type='button'
												onClick={() => setIsEditMode(false)}
												className='rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]'
											>
												Cancel
											</button>
											<button
												type='submit'
												className='rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
												disabled={isSavingGroup}
											>
												{isSavingGroup ? "Saving..." : "Save changes"}
											</button>
										</div>
									</form>
								) : null}

								{canManageGroup && showAddMembers ? (
									<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
										<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Add members</p>
												<p className='mt-1 text-sm text-slate-300'>Invite more people into this group.</p>
											</div>
											<div className='relative w-full sm:max-w-xs'>
												<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
												<input
													type='text'
													value={memberSearchValue}
													onChange={(event) => setMemberSearchValue(event.target.value)}
													placeholder='Search users'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</div>
										</div>

										<div className='mt-4 space-y-2'>
											{loadingSelectableUsers ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													Loading users...
												</div>
											) : filteredSelectableUsers.length === 0 ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													No available users to add.
												</div>
											) : (
												filteredSelectableUsers.map((member) => {
													const memberAvatar = getAvatarUrl(member.profilePic, 72) || getConversationFallbackAvatar(member);

													return (
														<div
															key={member._id}
															className='flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] px-3 py-3'
														>
															<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
																<img src={memberAvatar} alt={member.fullName} className='h-full w-full object-cover' />
															</div>
															<div className='min-w-0 flex-1'>
																<p className='truncate text-sm font-medium text-slate-100'>{member.fullName}</p>
																<p className='truncate text-xs text-slate-400'>@{member.username}</p>
															</div>
															<button
																type='button'
																onClick={() => handleAddMember(member._id)}
																className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																disabled={isMemberActionPending("add", member._id) || limitReached || hasPendingMemberAction}
															>
																<HiOutlineUserPlus className='h-4 w-4' />
																{isMemberActionPending("add", member._id) ? "Adding..." : "Add"}
															</button>
														</div>
													);
												})
											)}
										</div>
									</div>
								) : null}

								{canInviteToGroup && showInviteMembers ? (
									<div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
										<div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
											<div>
												<p className='text-xs font-semibold uppercase tracking-[0.22em] text-slate-400'>Invite users</p>
												<p className='mt-1 text-sm text-slate-300'>
													Send a join invitation. The user can accept or decline before entering the group.
												</p>
											</div>
											<div className='relative w-full sm:max-w-xs'>
												<HiMagnifyingGlass className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500' />
												<input
													type='text'
													value={memberSearchValue}
													onChange={(event) => setMemberSearchValue(event.target.value)}
													placeholder='Search users'
													className='w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/[0.06]'
												/>
											</div>
										</div>

										<div className='mt-4 space-y-2'>
											{loadingSelectableUsers ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													Loading users...
												</div>
											) : filteredSelectableUsers.length === 0 ? (
												<div className='rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400'>
													No available users to invite.
												</div>
											) : (
												filteredSelectableUsers.map((member) => {
													const memberAvatar = getAvatarUrl(member.profilePic, 72) || getConversationFallbackAvatar(member);

													return (
														<div
															key={`invite-${member._id}`}
															className='flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] px-3 py-3'
														>
															<div className='h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
																<img src={memberAvatar} alt={member.fullName} className='h-full w-full object-cover' />
															</div>
															<div className='min-w-0 flex-1'>
																<p className='truncate text-sm font-medium text-slate-100'>{member.fullName}</p>
																<p className='truncate text-xs text-slate-400'>@{member.username}</p>
															</div>
															<button
																type='button'
																onClick={() => handleSendInvite(member._id)}
																className='inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																disabled={hasPendingMemberAction}
															>
																<HiOutlineUserPlus className='h-4 w-4' />
																{isMemberActionPending("invite", member._id) ? "Sending..." : "Invite"}
															</button>
														</div>
													);
												})
											)}
										</div>
									</div>
								) : null}

								<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>About this group</p>
									<p className='mt-1 min-h-12 text-sm leading-6 text-slate-200'>
										{user.bio?.trim() || "No group description yet."}
									</p>
								</div>

								{user.members?.length ? (
									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Participants</p>
										<div className='mt-3 space-y-2'>
											{user.members.map((member) => (
												<div key={member._id} className='flex items-center gap-3 rounded-[18px] bg-slate-900/60 px-3 py-3'>
													<div className='min-w-0 flex-1'>
														<p className='truncate text-sm font-medium text-slate-100'>
															{member.fullName}
															{member._id === authUser?._id ? " (You)" : ""}
														</p>
														<p className='truncate text-xs text-slate-400'>@{member.username}</p>
													</div>
													<div className='flex items-center gap-2'>
														<span className='shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300'>
															{member.memberRole || "Member"}
														</span>
														{canManageGroup &&
														member._id !== authUser?._id &&
														member.memberRole !== "OWNER" ? (
															<>
																{isGroupOwner ? (
																	<button
																		type='button'
																		onClick={() => handleUpdateMemberRole(member._id, "OWNER")}
																		className='rounded-full border border-sky-300/20 bg-sky-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																		disabled={hasPendingMemberAction}
																	>
																		{isMemberActionPending("role", member._id) ? "Saving..." : "Make owner"}
																	</button>
																) : null}
																<button
																	type='button'
																	onClick={() =>
																		handleUpdateMemberRole(
																			member._id,
																			member.memberRole === "ADMIN" ? "MEMBER" : "ADMIN"
																		)
																	}
																	className='rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100 transition hover:border-amber-300/35 hover:bg-amber-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																	disabled={hasPendingMemberAction}
																>
																	{isMemberActionPending("role", member._id)
																		? "Saving..."
																		: member.memberRole === "ADMIN"
																			? "Make member"
																			: "Make admin"}
																</button>
																<button
																	type='button'
																	onClick={() => handleRemoveMember(member._id)}
																	className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/10 text-rose-100 transition hover:border-rose-300/35 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60'
																	disabled={hasPendingMemberAction}
																	title='Remove member'
																>
																	<HiOutlineUserMinus className='h-4 w-4' />
																</button>
															</>
														) : null}
													</div>
												</div>
											))}
										</div>
									</div>
								) : null}
							</>
						) : (
							<>
								{user.role === "DEVELOPER" ? (
									<div className='rounded-[24px] border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(249,115,22,0.1))] px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-amber-100/80'>Account status</p>
										<p className='mt-1 text-sm leading-6 text-amber-50'>
											{user.isPrimaryDeveloper
												? "Lead developer account with elevated platform control."
												: "Official developer account."}
										</p>
									</div>
								) : null}

								{user.isVerified ? (
									<div className='rounded-[24px] border border-sky-300/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.16),rgba(6,182,212,0.1))] px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/80'>Verification</p>
										<p className='mt-1 text-sm leading-6 text-sky-50'>This profile has a developer-assigned verified badge.</p>
									</div>
								) : null}

								<div className='grid gap-3 sm:grid-cols-2'>
									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Username</p>
										<p className='mt-1 text-base font-medium text-slate-100'>@{user.username}</p>
									</div>

									<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
										<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Gender</p>
										<p className='mt-1 text-base font-medium capitalize text-slate-100'>{user.gender || "Unknown"}</p>
									</div>
								</div>

								<div className='rounded-[24px] border border-slate-800 bg-slate-800/80 px-4 py-3.5'>
									<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Bio</p>
									<p className='mt-1 min-h-12 text-sm leading-6 text-slate-200'>{user.bio?.trim() || "No bio added yet."}</p>
								</div>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default UserInfoModal;
