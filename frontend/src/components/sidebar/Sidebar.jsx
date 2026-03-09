import { Link } from "react-router-dom";
import { IoChevronDownOutline, IoChevronUpOutline, IoCodeSlashOutline } from "react-icons/io5";
import { HiOutlineUserGroup } from "react-icons/hi2";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import CallDirectory from "./CallDirectory";
import Conversations from "./Conversations";
import CreateGroupModal from "./CreateGroupModal";
import LogoutButton from "./LogoutButton";
import SearchInput from "./SearchInput";
import ProfileButton from "./ProfileButton";
import useCallDirectory from "../../hooks/useCallDirectory";
import useGetConversations from "../../hooks/useGetConversations";
import { useSocketContext } from "../../context/SocketContext";
import { useAuthContext } from "../../context/AuthContext";
import useConversation from "../../zustand/useConversation";

const FILTERS = [
	{ id: "all", label: "All" },
	{ id: "online", label: "Online" },
	{ id: "calls", label: "Calls" },
];

const Sidebar = () => {
	const [searchValue, setSearchValue] = useState("");
	const [activeFilter, setActiveFilter] = useState("all");
	const [showQuickActions, setShowQuickActions] = useState(false);
	const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
	const { loading, conversations } = useGetConversations();
	const { loading: loadingCalls, calls } = useCallDirectory();
	const { onlineUsers } = useSocketContext();
	const { authUser } = useAuthContext();
	const { setSelectedConversation, setShowSidebar } = useConversation();
	const isDeveloper = authUser?.role === "DEVELOPER";

	const onlineCount = useMemo(
		() => conversations.filter((conversation) => onlineUsers.includes(conversation._id)).length,
		[conversations, onlineUsers]
	);

	const filteredConversations = useMemo(() => {
		const normalizedSearch = searchValue.trim().toLowerCase();

		return conversations.filter((conversation) => {
			const matchesFilter = activeFilter === "all" || (activeFilter === "online" && onlineUsers.includes(conversation._id));
			if (!matchesFilter) return false;
			if (!normalizedSearch) return true;

			return [conversation.fullName, conversation.username, conversation.bio, conversation.lastMessage]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedSearch));
		});
	}, [activeFilter, conversations, onlineUsers, searchValue]);

	const filteredCalls = useMemo(() => {
		const normalizedSearch = searchValue.trim().toLowerCase();
		if (!normalizedSearch) return calls;

		return calls.filter((call) =>
			[
				call.title,
				call.previewText,
				call.initiator?.fullName,
				...(Array.isArray(call.participants) ? call.participants.map((participant) => participant.user?.fullName) : []),
			]
				.filter(Boolean)
				.some((value) => value.toLowerCase().includes(normalizedSearch))
		);
	}, [calls, searchValue]);

	const emptyTitle = searchValue
		? "No match found"
		: activeFilter === "calls"
			? "No calls yet"
		: activeFilter === "online"
			? "Nobody is online right now"
			: "No conversations yet";

	const emptyDescription = searchValue
		? "Try another name, username or keyword from the last message preview."
		: activeFilter === "calls"
			? "Every live and recent call will appear here, with quick join access while a call is active."
		: activeFilter === "online"
			? "Switch back to all conversations or wait for someone to come online."
			: "Your contacts will appear here as soon as the sidebar data loads.";

	const handleOpenCallConversation = (call) => {
		const relatedConversation = conversations.find((conversation) =>
			conversation.type === "GROUP"
				? conversation._id === call.conversationId
				: conversation.conversationId === call.conversationId
		);

		if (!relatedConversation) {
			toast.error("Conversation not available");
			return;
		}

		setSelectedConversation(relatedConversation);
		setShowSidebar(false);
	};

	return (
		<aside className='flex h-full min-h-0 w-full flex-col border-r border-white/10 bg-[linear-gradient(180deg,rgba(7,12,25,0.92),rgba(3,8,20,0.84))] p-4 md:w-[360px] lg:w-[390px] lg:p-5'>
			<div className='mb-5'>
				<div className='flex items-start justify-between gap-4'>
					<div>
						<p className='text-[11px] font-semibold uppercase tracking-[0.34em] text-sky-300/70'>Chat Space</p>
						<h1 className='mt-2 text-2xl font-semibold text-white'>Messages</h1>
					</div>
					<div className='rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200'>
						{onlineCount} online
					</div>
				</div>
				{!isDeveloper ? (
					<p className='mt-3 max-w-sm text-sm leading-6 text-slate-400'>
						Search fast, open user info, send voice notes, use emoji, and keep chats readable without clutter.
					</p>
				) : null}
			</div>

			<SearchInput
				value={searchValue}
				onChange={setSearchValue}
				onClear={() => setSearchValue("")}
				totalCount={activeFilter === "calls" ? calls.length : conversations.length}
				visibleCount={activeFilter === "calls" ? filteredCalls.length : filteredConversations.length}
				activeFilter={activeFilter}
			/>

			<div className='mt-4 flex flex-wrap items-center gap-2'>
				{FILTERS.map((filter) => {
					const isActive = activeFilter === filter.id;

					return (
						<button
							key={filter.id}
							type='button'
							onClick={() => setActiveFilter(filter.id)}
							className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
								isActive
									? "bg-sky-500 text-white shadow-[0_12px_24px_rgba(14,165,233,0.24)]"
									: "border border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
							}`}
						>
							{filter.label}
						</button>
					);
				})}
				<button
					type='button'
					onClick={() => setShowCreateGroupModal(true)}
					className='inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/35 hover:bg-cyan-500/16'
				>
					<HiOutlineUserGroup className='h-4 w-4' />
					<span>New group</span>
				</button>
			</div>

			<div className='mb-3 mt-5 flex items-center justify-between gap-3'>
				<p className='text-xs font-semibold uppercase tracking-[0.28em] text-slate-500'>
					{activeFilter === "calls" ? "Calls" : "Recent chats"}
				</p>
				<p className='text-xs text-slate-500'>
					{activeFilter === "calls" ? filteredCalls.length : filteredConversations.length} visible
				</p>
			</div>

			{activeFilter === "calls" ? (
				<CallDirectory
					loading={loadingCalls}
					calls={filteredCalls}
					emptyTitle={emptyTitle}
					emptyDescription={emptyDescription}
					onOpenConversation={handleOpenCallConversation}
				/>
			) : (
				<Conversations
					loading={loading}
					conversations={filteredConversations}
					emptyTitle={emptyTitle}
					emptyDescription={emptyDescription}
				/>
			)}

			<div className='mt-4'>
				<div className='flex justify-end'>
					<button
						type='button'
						onClick={() => setShowQuickActions((currentValue) => !currentValue)}
						aria-expanded={showQuickActions}
						aria-label={showQuickActions ? "Hide quick actions" : "Show quick actions"}
						title={showQuickActions ? "Hide quick actions" : "Show quick actions"}
						className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-500/16'
					>
						<IoCodeSlashOutline className='h-4 w-4' />
						<span>{isDeveloper ? "Tools" : "Menu"}</span>
						{showQuickActions ? (
							<IoChevronUpOutline className='h-4 w-4' />
						) : (
							<IoChevronDownOutline className='h-4 w-4' />
						)}
					</button>
				</div>

				<div
					className={`grid transition-all duration-300 ease-out ${
						showQuickActions ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
					}`}
				>
					<div className='overflow-hidden'>
						<div className='space-y-3 rounded-[28px] border border-white/10 bg-white/[0.025] p-3 backdrop-blur-xl'>
							{isDeveloper ? (
								<Link
									to='/developer'
									className='group flex items-center justify-between gap-3 rounded-[24px] border border-sky-400/20 bg-sky-500/10 p-3 text-left transition hover:border-sky-300/35 hover:bg-sky-500/14'
								>
									<div className='flex min-w-0 items-center gap-3'>
										<div className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/15 text-sky-200'>
											<IoCodeSlashOutline className='h-5 w-5' />
										</div>
										<div className='min-w-0'>
											<p className='truncate text-sm font-semibold text-white'>Developer Console</p>
											<p className='mt-1 truncate text-xs text-sky-100/80'>
												Moderate users, messages, and roles
											</p>
										</div>
									</div>
									<span className='rounded-full border border-sky-300/20 bg-sky-400/12 px-3 py-1 text-[11px] font-medium text-sky-100'>
										Open
									</span>
								</Link>
							) : null}
							<ProfileButton />
							<LogoutButton />
						</div>
					</div>
				</div>
			</div>

			<CreateGroupModal
				open={showCreateGroupModal}
				onClose={() => setShowCreateGroupModal(false)}
				onCreated={(conversation) => {
					window.dispatchEvent(
						new CustomEvent("chat:conversation-restored", {
							detail: { conversation },
						})
					);
					setSelectedConversation(conversation);
					setShowSidebar(false);
				}}
			/>
		</aside>
	);
};

export default Sidebar;
