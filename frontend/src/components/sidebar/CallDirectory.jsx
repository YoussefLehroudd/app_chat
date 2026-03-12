import { memo } from "react";
import { HiOutlinePhoneArrowDownLeft, HiOutlinePhoneArrowUpRight, HiOutlineVideoCamera, HiOutlinePhone } from "react-icons/hi2";
import { useCallContext } from "../../context/CallContext";
import { extractTime } from "../../utils/extractTime";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const formatDuration = (totalSeconds = 0) => {
	const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const seconds = safeSeconds % 60;

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const CallDirectory = ({ calls, loading, emptyTitle, emptyDescription, onOpenConversation }) => {
	const { joinExistingCall, callState, isCallClosedForUi, getClosedCallInfo } = useCallContext();

	return (
		<div className='min-h-0 flex-1 overflow-hidden'>
			<div className='custom-scrollbar flex h-full flex-col gap-2.5 overflow-y-auto pb-2 pr-1'>
				{loading && calls.length === 0
					? Array.from({ length: 4 }).map((_, index) => (
							<div key={`call-skeleton-${index}`} className='rounded-[26px] border border-white/8 bg-white/[0.035] p-3.5'>
								<div className='flex items-center gap-3'>
									<div className='h-12 w-12 animate-pulse rounded-full bg-slate-700/60'></div>
									<div className='min-w-0 flex-1 space-y-2'>
										<div className='h-4 w-40 animate-pulse rounded bg-slate-700/60'></div>
										<div className='h-3 w-full max-w-[160px] animate-pulse rounded bg-slate-800/70'></div>
									</div>
								</div>
							</div>
					  ))
					: null}

				{!loading &&
					calls.map((call) => {
						const effectiveCall = getClosedCallInfo?.(call) || call;
						const avatarSrc = getAvatarUrl(effectiveCall.profilePic, 96) || getConversationFallbackAvatar(effectiveCall);
						const isLocallyClosed = isCallClosedForUi?.(effectiveCall.callId);
						const isActive = !isLocallyClosed && effectiveCall.status !== "ENDED";
						const relatedConversation = onOpenConversation ? true : false;
						const isCurrentCall = callState.callId === effectiveCall.callId;
						const canJoinNow = !isLocallyClosed && effectiveCall.canJoin;

						return (
							<div
								key={effectiveCall.callId}
								className={`rounded-[26px] border px-3.5 py-3.5 ${
									isActive ? "border-cyan-300/18 bg-cyan-500/8" : "border-white/8 bg-white/[0.02]"
								}`}
							>
								<div className='flex items-start gap-3'>
									<div className='relative shrink-0'>
										<div className='h-12 w-12 overflow-hidden rounded-full ring-1 ring-white/10'>
											<img src={avatarSrc} alt={call.title} className='h-full w-full object-cover' />
										</div>
										<span
											className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-slate-950 ${
												isActive ? "bg-emerald-400" : "bg-slate-500"
											}`}
										></span>
									</div>

									<div className='min-w-0 flex-1'>
										<div className='flex flex-wrap items-center gap-2'>
											<p className='truncate text-sm font-semibold text-slate-100'>{effectiveCall.title}</p>
											<span
												className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
													isActive
														? "border-emerald-300/20 bg-emerald-500/12 text-emerald-100"
														: "border-white/10 bg-white/[0.04] text-slate-400"
												}`}
											>
												{isActive ? "Live" : "Ended"}
											</span>
										</div>

										<p className='mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400'>
											<span className='inline-flex items-center gap-1'>
												{effectiveCall.mediaType === "video" ? (
													<HiOutlineVideoCamera className='h-4 w-4 text-sky-300' />
												) : (
													<HiOutlinePhone className='h-4 w-4 text-emerald-300' />
												)}
												{effectiveCall.mediaType === "video" ? "Video call" : "Voice call"}
											</span>
											<span>{extractTime(effectiveCall.startedAt)}</span>
											<span>{effectiveCall.joinedParticipantCount} joined</span>
											{!isActive ? <span>{formatDuration(effectiveCall.durationSeconds)}</span> : null}
										</p>

										<p className='mt-2 text-sm leading-6 text-slate-300'>{effectiveCall.previewText}</p>

										<div className='mt-3 flex flex-wrap gap-2'>
											<button
												type='button'
												onClick={() => joinExistingCall(effectiveCall)}
												disabled={!canJoinNow || isCurrentCall}
												className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16 disabled:cursor-not-allowed disabled:opacity-45'
											>
												<HiOutlinePhoneArrowDownLeft className='h-4 w-4' />
												{isCurrentCall ? "In call" : canJoinNow ? "Join live" : "Unavailable"}
											</button>
											<button
												type='button'
												onClick={() => onOpenConversation?.(call)}
												disabled={!relatedConversation}
												className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45'
											>
												<HiOutlinePhoneArrowUpRight className='h-4 w-4' />
												Open chat
											</button>
										</div>
									</div>
								</div>
							</div>
						);
					})}

				{!loading && calls.length === 0 ? (
					<div className='flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-slate-950/35 px-6 text-center'>
						<p className='text-base font-semibold text-slate-100'>{emptyTitle}</p>
						<p className='mt-2 max-w-xs text-sm leading-6 text-slate-400'>{emptyDescription}</p>
					</div>
				) : null}
			</div>
		</div>
	);
};

export default memo(CallDirectory);
