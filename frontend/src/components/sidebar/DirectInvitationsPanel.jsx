import { getAvatarUrl } from "../../utils/avatar";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";

const DirectInvitationsPanel = ({
	friends = [],
	onOpenFriend,
	incomingInvitations = [],
	outgoingInvitations = [],
	onRespond = async () => {},
	isRespondingToInvitation = () => false,
}) => {
	const hasFriends = Array.isArray(friends) && friends.length > 0;
	const hasIncoming = Array.isArray(incomingInvitations) && incomingInvitations.length > 0;
	const hasOutgoing = Array.isArray(outgoingInvitations) && outgoingInvitations.length > 0;

	return (
		<div className='mt-3 flex min-h-0 max-h-[56svh] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.025] p-3 md:max-h-none'>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300/75'>Friends & invitations</p>
				<p className='text-[10px] uppercase tracking-[0.14em] text-slate-400'>
					{friends.length} friends · {incomingInvitations.length} incoming
				</p>
			</div>

			<div className='custom-scrollbar mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 md:overflow-visible md:pr-0'>
				<div className='shrink-0 rounded-[20px] border border-white/10 bg-white/[0.02] p-2.5'>
					<div className='mb-2 flex items-center justify-between gap-2'>
						<p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400'>Friends</p>
						<p className='text-[10px] text-slate-500'>{friends.length}</p>
					</div>
					{hasFriends ? (
						<div className='custom-scrollbar max-h-44 space-y-2 overflow-y-auto pr-1'>
							{friends.map((friendConversation) => {
								const friendAvatar =
									getAvatarUrl(friendConversation?.profilePic, 72) || getConversationFallbackAvatar(friendConversation);
								return (
									<button
										key={friendConversation?._id || friendConversation?.conversationId}
										type='button'
										className='flex w-full items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.06]'
										onClick={() => onOpenFriend?.(friendConversation)}
									>
										<div className='h-9 w-9 overflow-hidden rounded-full ring-1 ring-white/10'>
											<img src={friendAvatar} alt={friendConversation?.fullName || "Friend"} className='h-full w-full object-cover' />
										</div>
										<div
											className='min-w-0 flex-1'
											data-copy-user={friendConversation?.username || undefined}
											title={friendConversation?.username ? "Click to copy username" : undefined}
										>
											<p className='truncate text-sm font-medium text-slate-100'>{friendConversation?.fullName || "Friend"}</p>
											<p className='truncate text-xs text-slate-400'>@{friendConversation?.username || "unknown"}</p>
										</div>
									</button>
								);
							})}
						</div>
					) : (
						<p className='text-xs text-slate-400'>No friends yet.</p>
					)}
				</div>

				<div className='shrink-0 rounded-[20px] border border-white/10 bg-white/[0.02] p-2.5'>
					<div className='mb-2 flex items-center justify-between gap-2'>
						<p className='text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400'>Invitations</p>
						{hasOutgoing ? (
							<p className='text-[10px] uppercase tracking-[0.14em] text-slate-500'>{outgoingInvitations.length} outgoing</p>
						) : null}
					</div>

					{hasIncoming ? (
						<div className='custom-scrollbar max-h-52 space-y-2 overflow-y-auto pr-1'>
							{incomingInvitations.map((invitation) => {
								const invitationId = invitation?._id;
								const sender = invitation?.sender;
								const senderAvatar = getAvatarUrl(sender?.profilePic, 72) || getConversationFallbackAvatar(sender);
								const isBusy = isRespondingToInvitation(invitationId);

								return (
									<div
										key={invitationId}
										className='rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-3'
									>
										<div className='flex items-center gap-3'>
											<div className='h-10 w-10 overflow-hidden rounded-full ring-1 ring-white/10'>
												<img src={senderAvatar} alt={sender?.fullName || "User"} className='h-full w-full object-cover' />
											</div>
											<div
												className='min-w-0 flex-1'
												data-copy-user={sender?.username || undefined}
												title={sender?.username ? "Click to copy username" : undefined}
											>
												<p className='truncate text-sm font-medium text-slate-100'>{sender?.fullName || "User"}</p>
												<p className='truncate text-xs text-slate-400'>@{sender?.username || "unknown"}</p>
											</div>
										</div>
										<div className='mt-2 flex items-center justify-end gap-2'>
											<button
												type='button'
												disabled={isBusy}
												onClick={() => {
													if (!invitationId) return;
													void onRespond(invitationId, "DECLINE");
												}}
												className='rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60'
											>
												Decline
											</button>
											<button
												type='button'
												disabled={isBusy}
												onClick={() => {
													if (!invitationId) return;
													void onRespond(invitationId, "ACCEPT");
												}}
												className='rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100 transition hover:border-emerald-300/45 hover:bg-emerald-500/22 disabled:cursor-not-allowed disabled:opacity-60'
											>
												{isBusy ? "..." : "Accept"}
											</button>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className='text-xs text-slate-400'>No incoming requests.</p>
					)}
				</div>
			</div>
		</div>
	);
};

export default DirectInvitationsPanel;
