import { useEffect, useRef, useState } from "react";
import { IoArchiveOutline, IoTrashOutline } from "react-icons/io5";
import formatLastSeen from "../../utils/lastSeen";
import VerifiedBadge from "../common/VerifiedBadge";
import { developerPermissionDefinitions } from "./developerDashboardShared";

const permissionShortLabels = {
	fullAccess: "Full access",
	manageUsers: "Users",
	editUserData: "Profile",
	manageGroups: "Groups",
	manageReports: "Reports",
	deleteGroups: "Delete groups",
	deleteMessages: "Delete msgs",
	deleteReports: "Delete reports",
};

const permissionPillClassName =
	"inline-flex min-h-10 min-w-[6.25rem] items-center justify-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]";

const PermissionOverflowChip = ({ hiddenPermissionCount, hiddenPermissions }) => {
	const triggerRef = useRef(null);
	const popoverRef = useRef(null);
	const [isOpen, setIsOpen] = useState(false);
	const [popoverPosition, setPopoverPosition] = useState({
		top: -9999,
		left: 16,
		placement: "bottom",
	});

	useEffect(() => {
		if (!isOpen) return undefined;

		const updatePosition = () => {
			const triggerElement = triggerRef.current;
			const popoverElement = popoverRef.current;
			if (!triggerElement || !popoverElement) return;

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const viewportPadding = 16;
			const triggerGap = 10;
			const triggerRect = triggerElement.getBoundingClientRect();
			const popoverRect = popoverElement.getBoundingClientRect();
			const spaceAbove = triggerRect.top - viewportPadding;
			const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding;
			const shouldPlaceAbove =
				spaceBelow < popoverRect.height + triggerGap && spaceAbove > spaceBelow;

			const top = shouldPlaceAbove
				? Math.max(viewportPadding, triggerRect.top - popoverRect.height - triggerGap)
				: Math.min(
						viewportHeight - viewportPadding - popoverRect.height,
						triggerRect.bottom + triggerGap
					);
			const left = Math.min(
				Math.max(viewportPadding, triggerRect.left),
				viewportWidth - viewportPadding - popoverRect.width
			);

			setPopoverPosition({
				top,
				left,
				placement: shouldPlaceAbove ? "top" : "bottom",
			});
		};

		const handlePointerDown = (event) => {
			if (triggerRef.current?.contains(event.target) || popoverRef.current?.contains(event.target)) {
				return;
			}

			setIsOpen(false);
		};

		const handleEscape = (event) => {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("touchstart", handlePointerDown);
		document.addEventListener("keydown", handleEscape);

		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("touchstart", handlePointerDown);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen]);

	return (
		<div
			className='relative'
			onMouseEnter={() => setIsOpen(true)}
			onMouseLeave={() => setIsOpen(false)}
			onFocus={() => setIsOpen(true)}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					setIsOpen(false);
				}
			}}
		>
			<button
				ref={triggerRef}
				type='button'
				aria-expanded={isOpen}
				onClick={() => setIsOpen((current) => !current)}
				className={`${permissionPillClassName} cursor-pointer border border-white/10 bg-white/[0.04] text-slate-300 outline-none transition hover:border-sky-300/20 hover:bg-sky-500/[0.08] hover:text-sky-100 focus:border-sky-300/20 focus:bg-sky-500/[0.08] focus:text-sky-100`}
			>
				+{hiddenPermissionCount} more
			</button>

			{isOpen ? (
				<div
					ref={popoverRef}
					className={`fixed z-40 w-[20rem] max-w-[calc(100vw-2rem)] rounded-[18px] border border-sky-300/16 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(11,20,38,0.96))] p-3 shadow-[0_22px_48px_rgba(2,6,23,0.52)] backdrop-blur-xl transition duration-200 ${
						popoverPosition.placement === "top" ? "origin-bottom" : "origin-top"
					}`}
					style={{
						top: `${popoverPosition.top}px`,
						left: `${popoverPosition.left}px`,
					}}
				>
					<div className='flex items-center justify-between gap-3'>
						<p className='text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200/70'>
							Additional access
						</p>
						<span className='rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-slate-200'>
							{hiddenPermissionCount}
						</span>
					</div>
					<div className='mt-3 space-y-2'>
						{hiddenPermissions.map((permission) => (
							<div key={permission.key} className='rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2'>
								<p className='text-xs font-semibold text-white'>{permission.label}</p>
								<p className='mt-1 text-[11px] leading-5 text-slate-400'>{permission.description}</p>
							</div>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
};

const DeveloperUsersPage = ({
	authUser,
	loading,
	filteredUsers,
	searchValue,
	setSearchValue,
	actionKey,
	handleRoleChange,
	handleVerificationToggle,
	openBanModal,
	openArchiveModal,
	openEditUserModal,
	openUserInsightsModal,
	openDeveloperPermissionsModal,
	openDeleteUserPopup,
	canManageUsers,
	canEditUserData,
	canManageDeveloperPermissions,
	canDeleteUsers,
}) => {
	return (
		<div className='w-full min-w-0 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:rounded-[30px] sm:p-6 lg:p-7'>
			<div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
				<div>
					<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>User control</p>
					<h2 className='mt-2 text-2xl font-semibold text-white'>Manage accounts, roles, and profile data</h2>
					<p className='mt-2 max-w-2xl text-sm leading-7 text-slate-400'>
						Promote trusted users to developer, edit usernames and passwords when needed, or archive
						accounts while preserving their conversations and private history.
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
						actionKey === `archive-user-${user._id}` ||
						actionKey === `edit-user-${user._id}` ||
						actionKey === `developer-permissions-${user._id}` ||
						actionKey === `delete-user-${user._id}`;
					const grantedPermissions = developerPermissionDefinitions.filter(
						(permission) => user.developerPermissions?.[permission.key]
					);
					const hasFullAccess = grantedPermissions.some((permission) => permission.key === "fullAccess");
					const visiblePermissions = hasFullAccess
						? grantedPermissions.filter((permission) => permission.key === "fullAccess")
						: grantedPermissions.slice(0, 1);
					const hiddenPermissions = hasFullAccess
						? grantedPermissions.filter((permission) => permission.key !== "fullAccess")
						: grantedPermissions.slice(visiblePermissions.length);
					const hiddenPermissionCount = Math.max(
						0,
						hasFullAccess ? grantedPermissions.length - 1 : grantedPermissions.length - visiblePermissions.length
					);

					return (
						<div
							key={user._id}
							className={`rounded-[20px] border p-3.5 transition hover:bg-white/[0.04] sm:rounded-[24px] sm:p-4 ${
								user.isArchived
									? "border-amber-300/20 bg-amber-400/[0.05] hover:border-amber-300/30"
									: user.isBanned
										? "border-rose-400/20 bg-rose-500/[0.045] hover:border-rose-400/30"
										: "border-white/8 bg-white/[0.025] hover:border-white/12"
							}`}
						>
							<div className='flex flex-col gap-4'>
								<div className='min-w-0'>
									<div className='flex flex-wrap items-center gap-2'>
										<p className='text-base font-semibold leading-tight text-white [overflow-wrap:anywhere] sm:text-lg'>
											{user.fullName}
										</p>
										<span
											className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
												user.role === "DEVELOPER"
													? "border border-sky-300/30 bg-sky-400/12 text-sky-100"
													: "border border-white/10 bg-white/[0.05] text-slate-300"
											}`}
										>
											{user.role}
										</span>
										{isCurrentUser ? (
											<span className='shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200'>
												You
											</span>
										) : null}
										{user.isBanned ? (
											<span className='shrink-0 rounded-full border border-rose-400/25 bg-rose-500/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100'>
												BANNED
											</span>
										) : null}
										<VerifiedBadge user={user} showLabel compact className='shrink-0' />
										{user.isArchived ? (
											<span className='shrink-0 rounded-full border border-amber-300/25 bg-amber-400/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
												ARCHIVED
											</span>
										) : null}
										{user.isPrimaryDeveloper ? (
											<span className='shrink-0 rounded-full border border-amber-300/25 bg-amber-400/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100'>
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
										<p className='mt-3 text-sm text-rose-100'>{user.bannedReason || "No reason provided"}</p>
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

								<div className='flex w-full flex-wrap items-center gap-2 lg:justify-end lg:gap-2.5'>
									{user.role === "DEVELOPER" && !user.isPrimaryDeveloper ? (
										<div className='flex min-w-0 flex-wrap items-center gap-1.5 lg:mr-auto'>
											{grantedPermissions.length > 0 ? (
												<>
													{visiblePermissions.map((permission) => (
														<span
															key={permission.key}
															className={`${permissionPillClassName} border border-sky-300/18 bg-sky-500/[0.08] text-sky-100`}
															title={permission.label}
														>
															{permissionShortLabels[permission.key] || permission.label}
														</span>
													))}
													{hiddenPermissionCount > 0 ? (
														<PermissionOverflowChip
															hiddenPermissionCount={hiddenPermissionCount}
															hiddenPermissions={hiddenPermissions}
														/>
													) : null}
												</>
											) : (
												<span className={`${permissionPillClassName} border border-white/10 bg-white/[0.04] font-medium text-slate-400`}>
													No delegated permissions
												</span>
											)}
										</div>
									) : null}
									<button
										type='button'
										onClick={() => openUserInsightsModal(user)}
										className='inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]'
									>
										Insights
									</button>
									<button
										type='button'
										disabled={!canEditUserData || isProtectedPrimary || isBusy}
										onClick={() => openEditUserModal(user)}
										className='inline-flex items-center justify-center whitespace-nowrap rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-50'
									>
										{actionKey === `edit-user-${user._id}` ? "Saving..." : "Edit user"}
									</button>
									<button
										type='button'
										disabled={!canManageUsers || isCurrentUser || isProtectedPrimary || isBusy}
										onClick={() => handleRoleChange(user, nextRole)}
										className='inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50'
									>
										{actionKey === `role-${user._id}` ? "Updating..." : roleActionLabel}
									</button>
									<button
										type='button'
										disabled={!canManageUsers || isProtectedPrimary || isBusy}
										onClick={() => handleVerificationToggle(user, !user.isVerified)}
										className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
										disabled={!canManageUsers || isCurrentUser || isProtectedPrimary || isBusy}
										onClick={() => openBanModal(user)}
										className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
										disabled={!canManageUsers || isCurrentUser || isProtectedPrimary || isBusy}
										onClick={() => openArchiveModal(user)}
										className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
									{canDeleteUsers && user.role !== "DEVELOPER" && (user.isArchived || user.isBanned) ? (
										<button
											type='button'
											disabled={isCurrentUser || isProtectedPrimary || isBusy}
											onClick={() => openDeleteUserPopup(user)}
											className='inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-rose-300/22 bg-rose-500/12 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-50'
										>
											<IoTrashOutline className='h-4 w-4' />
											{actionKey === `delete-user-${user._id}` ? "Deleting..." : "Delete forever"}
										</button>
									) : null}
									{user.role === "DEVELOPER" && !user.isPrimaryDeveloper && canManageDeveloperPermissions ? (
										<button
											type='button'
											disabled={isBusy}
											onClick={() => openDeveloperPermissionsModal(user)}
											className='inline-flex items-center justify-center whitespace-nowrap rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-50'
										>
											{actionKey === `developer-permissions-${user._id}` ? "Saving..." : "Permissions"}
										</button>
									) : null}
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
	);
};

export default DeveloperUsersPage;
