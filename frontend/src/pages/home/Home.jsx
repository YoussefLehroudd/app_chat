import MessageContainer from "../../components/messages/MessageContainer";
import Sidebar from "../../components/sidebar/Sidebar";
import useConversation from "../../zustand/useConversation";

const Home = () => {
	const { selectedConversation, showSidebar } = useConversation();

	return (
		<div className='flex h-full max-h-full min-h-0 w-full max-w-[1600px] overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.08),transparent_24%),linear-gradient(135deg,rgba(2,6,23,0.9),rgba(6,11,25,0.88))] shadow-[0_32px_90px_rgba(2,6,23,0.6)] backdrop-blur-2xl sm:rounded-[26px] lg:rounded-[34px]'>
			<div className={`${showSidebar ? "flex" : "hidden"} h-full min-h-0 w-full md:flex md:w-auto`}>
				<Sidebar />
			</div>

			<div className={`${!showSidebar || selectedConversation ? "flex" : "hidden"} h-full min-h-0 w-full flex-1 md:flex`}>
				<MessageContainer />
			</div>
		</div>
	);
};

export default Home;
