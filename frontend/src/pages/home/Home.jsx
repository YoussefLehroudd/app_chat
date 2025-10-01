import MessageContainer from "../../components/messages/MessageContainer";
import Sidebar from "../../components/sidebar/Sidebar";
import useConversation from "../../zustand/useConversation";

const Home = () => {
	const { selectedConversation, showSidebar } = useConversation();

	return (
		<div className='flex h-[calc(100vh-2rem)] sm:h-[500px] md:h-[600px] lg:h-[650px] w-full max-w-7xl rounded-lg overflow-hidden bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
			{/* Sidebar - Hidden on mobile when conversation is selected */}
			<div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-auto`}>
				<Sidebar />
			</div>
			
			{/* Message Container - Hidden on mobile when no conversation selected */}
			<div className={`${!showSidebar || selectedConversation ? 'flex' : 'hidden'} md:flex w-full`}>
				<MessageContainer />
			</div>
		</div>
	);
};
export default Home;
