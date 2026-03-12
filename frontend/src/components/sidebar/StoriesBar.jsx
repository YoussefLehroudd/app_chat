import { memo } from "react";
import { HiOutlinePlusSmall } from "react-icons/hi2";
import getConversationFallbackAvatar from "../../utils/conversationAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const getUserId = (user) => user?._id || user?.id || null;

const pickStoryToOpen = (group) => {
	if (!Array.isArray(group?.stories) || group.stories.length === 0) return null;
	const firstUnseenStory = group.stories.find((story) => !story?.isSeen && !story?.isOwn);
	return firstUnseenStory?._id || group.stories[0]?._id || null;
};

const StoryCircle = ({ label, imageSrc, hasUnseen = false, isOwn = false, onClick, onAddStory }) => (
	<div className='flex w-[66px] shrink-0 flex-col items-center gap-1.5 text-center'>
		<button
			type='button'
			onClick={onClick}
			className={`relative h-[56px] w-[56px] rounded-full p-[2px] transition-colors duration-150 ${
				hasUnseen
					? "bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500"
					: "bg-gradient-to-br from-white/20 via-white/10 to-white/5"
			}`}
			title={label}
		>
			<span className='absolute inset-[2px] overflow-hidden rounded-full border border-slate-900/65 bg-slate-900'>
				<img src={imageSrc} alt={label} loading='lazy' decoding='async' className='h-full w-full object-cover' />
			</span>
			{isOwn ? (
				<span
					className='absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-950 bg-sky-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.35)]'
					onClick={(event) => {
						event.stopPropagation();
						onAddStory?.();
					}}
				>
					<HiOutlinePlusSmall className='h-3.5 w-3.5' />
				</span>
			) : null}
		</button>
		<p className='w-full truncate text-[10px] font-medium text-slate-300'>{label}</p>
	</div>
);

const StoriesBar = ({ storyGroups, ownStoryGroup, loading, authUser, onAddStory, onOpenStory }) => {
	const ownUser = ownStoryGroup?.user || authUser;
	const ownAvatar = getAvatarUrl(ownUser?.profilePic, 96) || getConversationFallbackAvatar(ownUser || {});
	const ownHasStories = Array.isArray(ownStoryGroup?.stories) && ownStoryGroup.stories.length > 0;
	const otherGroups = (Array.isArray(storyGroups) ? storyGroups : []).filter(
		(group) => getUserId(group?.user) !== getUserId(ownUser)
	);

	const openOwnStory = () => {
		if (ownHasStories) {
			onOpenStory?.(ownStoryGroup, pickStoryToOpen(ownStoryGroup));
			return;
		}

		onAddStory?.();
	};

	return (
		<div className='mt-3 rounded-[22px] border border-white/10 bg-white/[0.03] p-2.5'>
			<div className='mb-2 flex items-center justify-between'>
				<p className='text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/75'>Stories</p>
				<button
					type='button'
					className='text-[11px] font-semibold text-cyan-200/85 transition hover:text-cyan-100'
					onClick={onAddStory}
				>
					Add story
				</button>
			</div>

			<div className='custom-scrollbar flex gap-2.5 overflow-x-auto pb-0.5'>
				<StoryCircle
					label='Your story'
					imageSrc={ownAvatar}
					hasUnseen={false}
					isOwn
					onAddStory={onAddStory}
					onClick={openOwnStory}
				/>

				{loading && otherGroups.length === 0
					? Array.from({ length: 4 }).map((_, index) => (
							<div key={`story-skeleton-${index}`} className='flex w-[66px] shrink-0 flex-col items-center gap-1.5'>
								<div className='h-[56px] w-[56px] animate-pulse rounded-full bg-slate-700/50'></div>
								<div className='h-2.5 w-12 animate-pulse rounded bg-slate-700/60'></div>
							</div>
					  ))
					: otherGroups.map((group) => {
							const groupAvatar =
								getAvatarUrl(group?.user?.profilePic, 96) || getConversationFallbackAvatar(group?.user || {});
							const entryStoryId = pickStoryToOpen(group);

							return (
								<StoryCircle
									key={group?.user?._id || group?.latestCreatedAt}
									label={group?.user?.fullName || "Unknown"}
									imageSrc={groupAvatar}
									hasUnseen={Boolean(group?.hasUnseen)}
									onClick={() => {
										if (!entryStoryId) return;
										onOpenStory?.(group, entryStoryId);
									}}
								/>
							);
					  })}
			</div>
		</div>
	);
};

export default memo(StoriesBar);
