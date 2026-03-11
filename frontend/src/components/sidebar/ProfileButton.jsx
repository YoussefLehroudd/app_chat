import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import getDefaultAvatar from "../../utils/defaultAvatar";
import { getAvatarUrl } from "../../utils/avatar";
import VerifiedBadge from "../common/VerifiedBadge";

const ProfileButton = () => {
	const { authUser } = useAuthContext();

	if (!authUser) return null;

	const fallbackAvatar = getDefaultAvatar(authUser.gender);
	const resolvedProfilePic = getAvatarUrl(authUser.profilePic, 64);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const imgRef = useRef(null);

	useEffect(() => {
		setAvatarSrc(resolvedProfilePic || fallbackAvatar);
		setAvatarLoaded(!resolvedProfilePic);
	}, [resolvedProfilePic, fallbackAvatar]);

	useEffect(() => {
		const img = imgRef.current;
		if (img?.complete && img.naturalWidth > 0) {
			setAvatarLoaded(true);
		}
	}, [avatarSrc]);

	return (
		<Link
			to='/profile'
			className='group flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-sky-400/25 hover:bg-white/[0.06]'
		>
			<div className='avatar shrink-0'>
				<div className='relative h-11 w-11 overflow-hidden rounded-full ring-1 ring-white/10'>
					<div
						className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
							avatarLoaded ? "opacity-0" : "opacity-100"
						}`}
					></div>
					<img
						ref={imgRef}
						src={avatarSrc}
						alt='Profile'
						className={`h-full w-full object-cover transition-opacity duration-200 ${
							avatarLoaded ? "opacity-100" : "opacity-0"
						}`}
						loading='eager'
						decoding='async'
						fetchpriority='high'
						onLoad={() => setAvatarLoaded(true)}
						onError={() => {
							setAvatarSrc(fallbackAvatar);
							setAvatarLoaded(true);
						}}
					/>
				</div>
			</div>

			<div className='min-w-0 flex-1'>
				<span className='flex items-center gap-2 truncate text-sm font-semibold text-slate-100'>
					<span className='truncate'>{authUser.fullName}</span>
					<VerifiedBadge user={authUser} compact />
				</span>
				<span className='mt-1 block truncate text-xs text-slate-400'>@{authUser.username}</span>
			</div>

			<span className='rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300 transition group-hover:border-sky-400/25 group-hover:text-slate-100'>
				Profile
			</span>
		</Link>
	);
};

export default ProfileButton;
