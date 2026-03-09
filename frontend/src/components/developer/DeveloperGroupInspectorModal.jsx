import { useEffect, useMemo, useState } from "react";
import {
	IoAddOutline,
	IoAttachOutline,
	IoCloseOutline,
	IoDocumentOutline,
	IoGlobeOutline,
	IoImageOutline,
	IoLockClosedOutline,
	IoPeopleOutline,
	IoRefreshOutline,
	IoSaveOutline,
	IoTrashOutline,
	IoVideocamOutline,
} from "react-icons/io5";
import formatLastSeen from "../../utils/lastSeen";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import {
	formatAttachmentSize,
	getAttachmentDownloadUrl,
	getAttachmentKindLabel,
	getAttachmentLabel,
	getMessageSummaryText,
	isImageAttachment,
	isVideoAttachment,
} from "../../utils/messageAttachments";

const formatDateTime = (value) => {
	if (!value) return "Unknown time";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(new Date(value));
	} catch {
		return value;
	}
};

const formatMessageTime = (value) => {
	if (!value) return "";

	try {
		return new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(value));
	} catch {
		return "";
	}
};

const formatMessageDay = (value) => {
	if (!value) return "";

	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
		}).format(new Date(value));
	} catch {
		return "";
	}
};

const isSameCalendarDay = (firstValue, secondValue) => {
	if (!firstValue || !secondValue) return false;

	const firstDate = new Date(firstValue);
	const secondDate = new Date(secondValue);

	return (
		firstDate.getFullYear() === secondDate.getFullYear() &&
		firstDate.getMonth() === secondDate.getMonth() &&
		firstDate.getDate() === secondDate.getDate()
	);
};

const getMessageText = (message) => {
	if (!message) return "Message";
	return getMessageSummaryText(message);
};

const getReplyPreview = (message) => {
	const repliedMessage = message?.repliedMessageId;
	if (!repliedMessage) return "";
	return getMessageSummaryText(repliedMessage);
};

const badgeClassNamesByRole = {
	OWNER: "border-amber-300/25 bg-amber-400/12 text-amber-100",
	ADMIN: "border-sky-300/25 bg-sky-500/12 text-sky-100",
	MEMBER: "border-white/10 bg-white/[0.05] text-slate-300",
};

const roleOptions = ["OWNER", "ADMIN", "MEMBER"];

const DeveloperGroupInspectorModal = ({
	group,
	allUsers,
	loading,
	actionKey,
	onClose,
	onRefresh,
	onDeleteGroup,
	onDeleteMessage,
	onSaveGroupSettings,
	onAddMember,
	onUpdateMemberRole,
	onRemoveMember,
	canManageGroups,
	canDeleteGroup,
	canDeleteMessage,
}) => {
	const [settings, setSettings] = useState({
		title: "",
		description: "",
		isPrivate: false,
		memberLimit: "",
	});
	const [selectedNewMemberId, setSelectedNewMemberId] = useState("");

	if (!group && !loading) return null;

	const groupAvatar = getAvatarUrl(group?.profilePic, 192) || getConversationFallbackAvatar({ type: "GROUP" });
	const members = group?.members || [];
	const memberLookup = new Map(members.map((member) => [member._id, member]));
	const messages = [...(group?.messages || [])].sort(
		(messageA, messageB) => new Date(messageA.createdAt).getTime() - new Date(messageB.createdAt).getTime()
	);
	const isDeletingGroup = group ? actionKey === `delete-group-${group._id}` : false;
	const isSavingSettings = group ? actionKey === `save-group-settings-${group._id}` : false;
	const isAddingMember = group ? actionKey === `add-group-member-${group._id}` : false;

	useEffect(() => {
		setSettings({
			title: group?.title || "",
			description: group?.description || "",
			isPrivate: Boolean(group?.isPrivate),
			memberLimit: group?.memberLimit ? String(group.memberLimit) : "",
		});
	}, [group]);

	const availableUsers = useMemo(
		() =>
			(allUsers || []).filter(
				(user) =>
					!user.isArchived &&
					!user.isBanned &&
					!members.some((member) => member._id === user._id)
			),
		[allUsers, members]
	);

	useEffect(() => {
		if (selectedNewMemberId && availableUsers.some((user) => user._id === selectedNewMemberId)) {
			return;
		}
		setSelectedNewMemberId(availableUsers[0]?._id || "");
	}, [availableUsers, selectedNewMemberId]);

	const handleSettingsSubmit = async (event) => {
		event.preventDefault();
		if (!group || !canManageGroups) return;
		await onSaveGroupSettings(group._id, settings);
	};

	const handleAddMember = async () => {
		if (!group || !canManageGroups || !selectedNewMemberId) return;
		await onAddMember(group._id, [selectedNewMemberId]);
	};

	return (
		<div className='absolute inset-0 z-40 flex items-center justify-center bg-slate-950/78 px-4 py-4 backdrop-blur-md'>
			<div className='flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(10,18,34,0.94))] shadow-[0_28px_90px_rgba(2,6,23,0.65)]'>
				<div className='flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between'>
					<div className='flex min-w-0 items-center gap-4'>
						<img
							src={groupAvatar}
							alt={group?.title || "Group avatar"}
							className='h-20 w-20 rounded-[26px] border border-white/12 object-cover shadow-[0_18px_34px_rgba(14,165,233,0.18)]'
							onError={(event) => {
								event.currentTarget.src = getConversationFallbackAvatar({ type: "GROUP" });
							}}
						/>

						<div className='min-w-0'>
							<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500'>
								Group inspection
							</p>
							<h3 className='mt-2 truncate text-2xl font-semibold text-white sm:text-3xl'>
								{group?.title || "Loading group"}
							</h3>
							<div className='mt-3 flex flex-wrap items-center gap-2 text-xs'>
								<span
									className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.2em] ${
										group?.isPrivate
											? "border-rose-300/20 bg-rose-500/10 text-rose-100"
											: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
									}`}
								>
									{group?.isPrivate ? <IoLockClosedOutline className='h-3.5 w-3.5' /> : <IoGlobeOutline className='h-3.5 w-3.5' />}
									{group?.isPrivate ? "Private" : "Public"}
								</span>
								<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-medium text-slate-300'>
									{group?.memberCount || 0} members
								</span>
								<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-medium text-slate-300'>
									{group?.messageCount || 0} messages
								</span>
								{group?.memberLimit ? (
									<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-medium text-slate-300'>
										Limit {group.memberLimit}
									</span>
								) : null}
							</div>
							<p className='mt-3 max-w-3xl text-sm leading-7 text-slate-400'>
								Direct messages stay outside this panel. This inspector only shows group activity and moderation tools.
							</p>
						</div>
					</div>

					<div className='flex flex-wrap items-center gap-2 lg:justify-end'>
						<button
							type='button'
							onClick={onRefresh}
							disabled={loading || isDeletingGroup}
							className='inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50'
						>
							<IoRefreshOutline className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
							Refresh
						</button>
						<button
							type='button'
							onClick={() => onDeleteGroup(group)}
							disabled={!canDeleteGroup || loading || isDeletingGroup}
							className='inline-flex items-center justify-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-50'
						>
							<IoTrashOutline className='h-4 w-4' />
							{isDeletingGroup ? "Deleting..." : "Delete group"}
						</button>
						<button
							type='button'
							onClick={onClose}
							disabled={Boolean(actionKey)}
							className='inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent p-3 text-slate-300 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50'
							aria-label='Close group inspector'
						>
							<IoCloseOutline className='h-5 w-5' />
						</button>
					</div>
				</div>

				{loading ? (
					<div className='flex flex-1 items-center justify-center px-6'>
						<div className='rounded-[26px] border border-white/10 bg-white/[0.03] px-6 py-5 text-sm text-slate-300'>
							Loading group details...
						</div>
					</div>
				) : (
					<div className='grid min-h-0 flex-1 gap-4 overflow-hidden p-4 sm:p-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:p-6'>
						<div className='custom-scrollbar space-y-4 overflow-y-auto pr-1'>
							<form onSubmit={handleSettingsSubmit} className='rounded-[28px] border border-white/10 bg-white/[0.03] p-5'>
								<div className='flex flex-wrap items-center justify-between gap-3'>
									<div>
										<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Group settings</p>
										<h4 className='mt-2 text-xl font-semibold text-white'>Developer controls</h4>
									</div>
									<button
										type='submit'
										disabled={!canManageGroups || isSavingSettings || isDeletingGroup}
										className='inline-flex items-center justify-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/16 disabled:cursor-not-allowed disabled:opacity-50'
									>
										<IoSaveOutline className='h-4 w-4' />
										{isSavingSettings ? "Saving..." : "Save"}
									</button>
								</div>

								<div className='mt-5 grid gap-4'>
									<div>
										<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Group name</label>
										<input
											type='text'
											value={settings.title}
											onChange={(event) => setSettings((currentSettings) => ({ ...currentSettings, title: event.target.value }))}
											className='mt-2 h-11 w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none'
											disabled={!canManageGroups}
										/>
									</div>

									<div>
										<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Description</label>
										<textarea
											value={settings.description}
											onChange={(event) =>
												setSettings((currentSettings) => ({ ...currentSettings, description: event.target.value }))
											}
											rows={4}
											className='mt-2 w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-100 outline-none'
											disabled={!canManageGroups}
										/>
									</div>

									<div className='grid gap-4 sm:grid-cols-2'>
										<div>
											<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Access</label>
											<select
												value={settings.isPrivate ? "PRIVATE" : "PUBLIC"}
												onChange={(event) =>
													setSettings((currentSettings) => ({
														...currentSettings,
														isPrivate: event.target.value === "PRIVATE",
													}))
												}
												className='mt-2 h-11 w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none'
												disabled={!canManageGroups}
											>
												<option value='PUBLIC'>Public</option>
												<option value='PRIVATE'>Private</option>
											</select>
										</div>

										<div>
											<label className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Member limit</label>
											<input
												type='number'
												min='2'
												value={settings.memberLimit}
												onChange={(event) =>
													setSettings((currentSettings) => ({ ...currentSettings, memberLimit: event.target.value }))
												}
												placeholder='No limit'
												className='mt-2 h-11 w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500'
												disabled={!canManageGroups}
											/>
										</div>
									</div>
								</div>
							</form>

							<div className='rounded-[28px] border border-white/10 bg-white/[0.03] p-5'>
								<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>Overview</p>
								<p className='mt-4 text-sm leading-7 text-slate-300'>
									{group?.description?.trim() || "No group description yet."}
								</p>

								<div className='mt-5 space-y-3 text-sm text-slate-400'>
									<div className='flex items-center justify-between gap-3'>
										<span>Owner</span>
										<span className='truncate text-right text-slate-200'>
											{group?.owner?.fullName || "Unknown"}
										</span>
									</div>
									<div className='flex items-center justify-between gap-3'>
										<span>Created by</span>
										<span className='truncate text-right text-slate-200'>
											{group?.createdBy?.fullName || "Unknown"}
										</span>
									</div>
									<div className='flex items-center justify-between gap-3'>
										<span>Created</span>
										<span className='text-right text-slate-200'>{formatDateTime(group?.createdAt)}</span>
									</div>
									<div className='flex items-center justify-between gap-3'>
										<span>Latest activity</span>
										<span className='text-right text-slate-200'>
											{formatDateTime(group?.latestActivityAt || group?.updatedAt)}
										</span>
									</div>
								</div>
							</div>

							<div className='rounded-[28px] border border-white/10 bg-white/[0.03] p-5'>
								<div className='flex items-center justify-between gap-3'>
									<div>
										<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
											Participants
										</p>
										<h4 className='mt-2 text-xl font-semibold text-white'>{members.length} members</h4>
									</div>
									<div className='inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-100'>
										<IoPeopleOutline className='h-5 w-5' />
									</div>
								</div>

								<div className='mt-5 rounded-[22px] border border-white/8 bg-slate-950/30 p-4'>
									<p className='text-xs font-medium uppercase tracking-[0.18em] text-slate-500'>Add member</p>
									<div className='mt-3 flex flex-col gap-3'>
										<select
											value={selectedNewMemberId}
											onChange={(event) => setSelectedNewMemberId(event.target.value)}
											disabled={!canManageGroups || availableUsers.length === 0 || isAddingMember}
											className='h-11 w-full rounded-[16px] border border-white/10 bg-slate-950/35 px-4 text-sm text-slate-100 outline-none disabled:opacity-50'
										>
											{availableUsers.length === 0 ? <option value=''>No users available</option> : null}
											{availableUsers.map((user) => (
												<option key={user._id} value={user._id}>
													{user.fullName} (@{user.username})
												</option>
											))}
										</select>
										<button
											type='button'
											onClick={handleAddMember}
											disabled={!canManageGroups || !selectedNewMemberId || isAddingMember}
											className='inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/16 disabled:cursor-not-allowed disabled:opacity-50'
										>
											<IoAddOutline className='h-4 w-4' />
											{isAddingMember ? "Adding..." : "Add member"}
										</button>
									</div>
								</div>

								<div className='mt-5 space-y-3'>
									{members.map((member) => {
										const avatarSrc =
											getAvatarUrl(member.profilePic, 80) || getConversationFallbackAvatar(member);
										const isRemovingMember =
											actionKey === `remove-group-member-${group._id}-${member._id}`;
										return (
											<div
												key={member._id}
												className='rounded-[22px] border border-white/8 bg-white/[0.025] px-4 py-3'
											>
												<div className='flex items-start gap-3'>
													<img
														src={avatarSrc}
														alt={member.fullName}
														className='h-11 w-11 rounded-2xl border border-white/10 object-cover'
														onError={(event) => {
															event.currentTarget.src = getConversationFallbackAvatar(member);
														}}
													/>
													<div className='min-w-0 flex-1'>
														<div className='flex flex-wrap items-center gap-2'>
															<p className='truncate text-sm font-semibold text-white'>{member.fullName}</p>
															<span
																className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
																	badgeClassNamesByRole[member.memberRole] ||
																	"border-white/10 bg-white/[0.05] text-slate-300"
																}`}
															>
																{member.memberRole}
															</span>
														</div>
														<p className='mt-1 truncate text-xs text-slate-400'>@{member.username}</p>
														<div className='mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500'>
															<span>Joined {formatDateTime(member.joinedAt)}</span>
															<span>{formatLastSeen(member.lastSeen)}</span>
														</div>

														<div className='mt-3 flex flex-wrap gap-2'>
															{roleOptions.map((role) => {
																const roleActionKey = `update-group-role-${group._id}-${member._id}-${role}`;
																const isUpdatingRole = actionKey === roleActionKey;
																return (
																	<button
																		key={role}
																		type='button'
																		onClick={() => onUpdateMemberRole(group._id, member._id, role)}
																		disabled={!canManageGroups || isDeletingGroup || isRemovingMember || isUpdatingRole}
																		className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
																			member.memberRole === role
																				? "border-sky-300/28 bg-sky-500/12 text-sky-100"
																				: "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
																		}`}
																	>
																		{isUpdatingRole ? "Saving..." : role}
																	</button>
																);
															})}
															<button
																type='button'
																onClick={() => onRemoveMember(group._id, member)}
																disabled={!canManageGroups || member.memberRole === "OWNER" || isDeletingGroup || isRemovingMember}
																className='rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-50'
															>
																{isRemovingMember ? "Removing..." : "Remove"}
															</button>
														</div>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						</div>

						<div className='custom-scrollbar overflow-y-auto pr-1'>
							<div className='rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.52),rgba(7,13,26,0.68))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6'>
								<div className='flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
									<div>
										<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
											Conversation view
										</p>
										<h4 className='mt-2 text-2xl font-semibold text-white'>Full message flow</h4>
									</div>
									<p className='text-xs text-slate-500'>
										Showing {messages.length} of {group?.messageCount || messages.length} saved messages in conversation order.
									</p>
								</div>

								<div className='mt-5 rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.08),transparent_42%),linear-gradient(180deg,rgba(2,6,23,0.84),rgba(3,7,18,0.74))] p-4 sm:p-5'>
									{messages.length === 0 ? (
										<div className='rounded-[24px] border border-dashed border-white/10 bg-slate-950/30 px-5 py-6 text-sm text-slate-400'>
											This group has no messages yet.
										</div>
									) : (
										<div className='space-y-4'>
											{messages.map((message, index) => {
											const isDeletingMessage = actionKey === `delete-group-message-${message._id}`;
											const replyPreview = getReplyPreview(message);
											const messageText = getMessageText(message);
											const sender = message.sender || null;
											const senderMember = sender ? memberLookup.get(sender._id) : null;
											const senderRole = senderMember?.memberRole || null;
											const senderAvatar =
												getAvatarUrl(sender?.profilePic, 72) ||
												getConversationFallbackAvatar(sender || { gender: null });
											const attachmentDownloadUrl = getAttachmentDownloadUrl(message);
											const shouldShowDayDivider =
												index === 0 || !isSameCalendarDay(message.createdAt, messages[index - 1]?.createdAt);

											return (
												<div key={message._id}>
													{shouldShowDayDivider ? (
														<div className='mb-4 flex items-center gap-3'>
															<div className='h-px flex-1 bg-white/8'></div>
															<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-400'>
																{formatMessageDay(message.createdAt)}
															</span>
															<div className='h-px flex-1 bg-white/8'></div>
														</div>
													) : null}

													{message.isSystem ? (
														<div className='mb-4 flex justify-center'>
															<div className='max-w-xl rounded-[22px] border border-cyan-300/18 bg-cyan-500/[0.08] px-4 py-3 text-center shadow-[0_14px_28px_rgba(14,165,233,0.08)]'>
																<p className='text-sm leading-7 text-cyan-100'>{messageText}</p>
																<p className='mt-1 text-[11px] text-cyan-200/70'>{formatDateTime(message.createdAt)}</p>
															</div>
														</div>
													) : (
														<div className='mb-4 flex items-start gap-3'>
															<img
																src={senderAvatar}
																alt={sender?.fullName || "User avatar"}
																className='mt-1 h-10 w-10 rounded-full border border-white/10 object-cover'
																onError={(event) => {
																	event.currentTarget.src = getConversationFallbackAvatar(sender || { gender: null });
																}}
															/>

															<div className='min-w-0 flex-1'>
																<div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
																	<div className='min-w-0'>
																		<div className='flex flex-wrap items-center gap-2'>
																			<p className='truncate text-sm font-semibold text-white'>
																				{sender?.fullName || "Unknown user"}
																			</p>
																			{sender?.username ? (
																				<span className='text-xs text-slate-500'>@{sender.username}</span>
																			) : null}
																			{senderRole ? (
																				<span
																					className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
																						badgeClassNamesByRole[senderRole] ||
																						"border-white/10 bg-white/[0.05] text-slate-300"
																					}`}
																				>
																					{senderRole}
																				</span>
																			) : null}
																			{message.isGroupInvite ? (
																				<span className='rounded-full border border-sky-300/18 bg-sky-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100'>
																					Invite
																				</span>
																			) : null}
																		</div>
																		<p className='mt-1 text-xs text-slate-500'>{formatMessageTime(message.createdAt)}</p>
																	</div>

																	<button
																		type='button'
																		onClick={() => onDeleteMessage(group._id, message)}
																		disabled={!canDeleteMessage || isDeletingMessage || isDeletingGroup}
																		className='inline-flex items-center justify-center gap-2 self-start rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-50'
																	>
																		<IoTrashOutline className='h-3.5 w-3.5' />
																		{isDeletingMessage ? "Deleting..." : "Delete"}
																	</button>
																</div>

																<div
																	className={`max-w-3xl rounded-[26px] border px-4 py-3 shadow-[0_16px_32px_rgba(2,6,23,0.2)] ${
																		message.isGroupInvite
																			? "border-sky-300/18 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(37,99,235,0.16))]"
																			: "border-white/8 bg-slate-900/85"
																	}`}
																>
																	{replyPreview ? (
																		<div className='mb-3 rounded-[18px] border border-white/8 bg-slate-950/35 px-4 py-3 text-xs text-slate-400'>
																			Reply preview: {replyPreview}
																		</div>
																	) : null}

																	{message.isGroupInvite && message.groupInvite ? (
																		<div className='mb-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3'>
																			<p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75'>
																				Group invitation
																			</p>
																			<p className='mt-2 text-sm font-semibold text-white'>
																				{message.groupInvite.groupTitle}
																			</p>
																			<p className='mt-1 text-xs text-slate-300'>
																				Invited by {message.groupInvite.inviterName}
																				{message.groupInvite.isPrivate ? " · Private group" : " · Public group"}
																			</p>
																			{message.groupInvite.groupDescription?.trim() ? (
																				<p className='mt-2 text-sm leading-6 text-slate-300'>
																					{message.groupInvite.groupDescription}
																				</p>
																			) : null}
																		</div>
																	) : null}

																	{message.message ? (
																		<p className='whitespace-pre-wrap break-words text-sm leading-7 text-slate-100'>
																			{messageText}
																		</p>
																	) : null}

																	{message.attachment ? (
																		<div className={`${message.message ? "mt-3" : ""}`}>
																			{isImageAttachment(message.attachment) ? (
																				<img
																					src={message.attachment.url}
																					alt={getAttachmentLabel(message.attachment)}
																					className='max-h-[320px] w-full rounded-[18px] border border-white/10 object-cover'
																				/>
																			) : isVideoAttachment(message.attachment) ? (
																				<video
																					controls
																					src={message.attachment.url}
																					className='max-h-[320px] w-full rounded-[18px] border border-white/10 bg-slate-950/45'
																				>
																					Your browser does not support video playback.
																				</video>
																			) : (
																				<a
																					href={attachmentDownloadUrl || message.attachment.url}
																					download={message.attachment.fileName || undefined}
																					className='flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.06]'
																				>
																					<div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-slate-950/45 text-slate-200'>
																						{message.attachment.type === "PDF" ? (
																							<IoDocumentOutline className='h-6 w-6' />
																						) : message.attachment.type === "IMAGE" ? (
																							<IoImageOutline className='h-6 w-6' />
																						) : message.attachment.type === "VIDEO" ? (
																							<IoVideocamOutline className='h-6 w-6' />
																						) : (
																							<IoAttachOutline className='h-6 w-6' />
																						)}
																					</div>
																					<div className='min-w-0 flex-1'>
																						<p className='truncate text-sm font-semibold text-white'>
																							{getAttachmentLabel(message.attachment)}
																						</p>
																						<p className='mt-1 text-xs text-slate-400'>
																							{[
																								getAttachmentKindLabel(message.attachment),
																								formatAttachmentSize(message.attachment.fileSize),
																							]
																								.filter(Boolean)
																								.join(" · ")}
																						</p>
																					</div>
																				</a>
																			)}
																		</div>
																	) : null}

																	{message.audio ? (
																		<div className={`${message.message ? "mt-3" : ""}`}>
																			<audio controls src={message.audio} className='w-full'>
																				Your browser does not support audio playback.
																			</audio>
																		</div>
																	) : null}
																</div>
															</div>
														</div>
													)}
												</div>
											);
										})}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default DeveloperGroupInspectorModal;
