import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../zustand/useConversation";

const Conversation = ({ conversation, lastIdx, emoji }) => {
	const { selectedConversation, setSelectedConversation, setShowSidebar } = useConversation();

	const isSelected = selectedConversation?._id === conversation._id;
	const { onlineUsers } = useSocketContext();
	const isOnline = onlineUsers.includes(conversation._id);

	const handleClick = () => {
		setSelectedConversation(conversation);
		// Hide sidebar on mobile when conversation is selected
		setShowSidebar(false);
	};

	return (
		<>
			<div
				className={`flex gap-2 md:gap-3 items-center hover:bg-sky-500 rounded p-3 md:p-2 py-2 md:py-1 cursor-pointer transition-colors
				${isSelected ? "bg-sky-500" : ""}
			`}
				onClick={handleClick}
			>
				<div className={`avatar ${isOnline ? "online" : ""}`}>
					<div className='w-12 md:w-12 rounded-full'>
						<img src={conversation.profilePic} alt='user avatar' />
					</div>
				</div>

				<div className='flex flex-col flex-1 min-w-0'>
					<div className='flex gap-2 md:gap-3 justify-between items-center'>
						<p className='font-bold text-gray-200 text-sm md:text-base truncate'>{conversation.fullName}</p>
						<span className='text-lg md:text-xl flex-shrink-0'>{emoji}</span>
					</div>
				</div>
			</div>

			{!lastIdx && <div className='divider my-0 py-0 h-1' />}
		</>
	);
};
export default Conversation;

// STARTER CODE SNIPPET
// const Conversation = () => {
// 	return (
// 		<>
// 			<div className='flex gap-2 items-center hover:bg-sky-500 rounded p-2 py-1 cursor-pointer'>
// 				<div className='avatar online'>
// 					<div className='w-12 rounded-full'>
// 						<img
// 							src='https://cdn0.iconfinder.com/data/icons/communication-line-10/24/account_profile_user_contact_person_avatar_placeholder-512.png'
// 							alt='user avatar'
// 						/>
// 					</div>
// 				</div>

// 				<div className='flex flex-col flex-1'>
// 					<div className='flex gap-3 justify-between'>
// 						<p className='font-bold text-gray-200'>John Doe</p>
// 						<span className='text-xl'>🎃</span>
// 					</div>
// 				</div>
// 			</div>

// 			<div className='divider my-0 py-0 h-1' />
// 		</>
// 	);
// };
// export default Conversation;
