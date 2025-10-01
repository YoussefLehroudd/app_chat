import { useAuthContext } from "../../context/AuthContext";
import { extractTime } from "../../utils/extractTime";
import useConversation from "../../zustand/useConversation";

const Message = ({ message }) => {
	const { authUser } = useAuthContext();
	const { selectedConversation } = useConversation();
	const fromMe = message.senderId === authUser._id;
	const formattedTime = extractTime(message.createdAt);
	const chatClassName = fromMe ? "chat-end" : "chat-start";
	const profilePic = fromMe ? authUser.profilePic : selectedConversation?.profilePic;
	const bubbleBgColor = fromMe ? "bg-blue-500" : "";

	const shakeClass = message.shouldShake ? "shake" : "";

	return (
		<div className={`chat ${chatClassName}`}>
			<div className='chat-image avatar'>
				<div className='w-8 md:w-10 rounded-full'>
					<img alt='Tailwind CSS chat bubble component' src={profilePic} />
				</div>
			</div>
			<div className={`chat-bubble text-white text-sm md:text-base ${bubbleBgColor} ${shakeClass} pb-2 break-words max-w-[75%] sm:max-w-xs md:max-w-md`}>{message.message}</div>
			<div className='chat-footer opacity-50 text-xs flex gap-1 items-center'>
				{formattedTime}
				{fromMe && (
					<span className='text-xs'>
						{message.isSeen ? (
							<span className='text-blue-400'>✓✓</span>
						) : (
							<span className='text-gray-400'>✓</span>
						)}
					</span>
				)}
			</div>
		</div>
	);
};
export default Message;
