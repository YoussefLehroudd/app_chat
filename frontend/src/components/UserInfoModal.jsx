import { useEffect, useRef, useState } from "react";
import getDefaultAvatar from "../utils/defaultAvatar";
import { getAvatarUrl } from "../utils/avatar";
import DeveloperBadge from "./common/DeveloperBadge";
import VerifiedBadge from "./common/VerifiedBadge";

const UserInfoModal = ({ user, open, onClose }) => {
	const fallbackAvatar = getDefaultAvatar(user?.gender);
	const resolvedProfilePic = getAvatarUrl(user?.profilePic, 256);
	const [avatarSrc, setAvatarSrc] = useState(resolvedProfilePic || fallbackAvatar);
	const [avatarLoaded, setAvatarLoaded] = useState(!resolvedProfilePic);
	const imgRef = useRef(null);

	useEffect(() => {
		if (!open) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	useEffect(() => {
		setAvatarSrc(resolvedProfilePic || fallbackAvatar);
		setAvatarLoaded(!resolvedProfilePic);
	}, [resolvedProfilePic, fallbackAvatar]);

	useEffect(() => {
		const img = imgRef.current;
		if (!img) return;
		if (img.complete && img.naturalWidth > 0) {
			setAvatarLoaded(true);
		}
	}, [avatarSrc]);

	if (!open || !user) return null;

	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4'
			onClick={onClose}
		>
			<div
				className='w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 text-white shadow-2xl backdrop-blur-md'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='mb-5 flex items-start justify-between gap-4'>
					<div>
						<p className='text-xs uppercase tracking-[0.28em] text-sky-300/80'>User Info</p>
						<div className='mt-1 flex flex-wrap items-center gap-2'>
							<h2 className='text-2xl font-bold text-slate-50'>{user.fullName}</h2>
							<VerifiedBadge user={user} />
							<DeveloperBadge user={user} />
						</div>
					</div>
					<button
						type='button'
						className='rounded-full border border-slate-600 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-400 hover:text-white'
						onClick={onClose}
					>
						Close
					</button>
				</div>

				<div className='mb-6 flex justify-center'>
					<div className='relative h-28 w-28 overflow-hidden rounded-full border-4 border-sky-400/30 bg-slate-800'>
						<div
							className={`absolute inset-0 bg-slate-700/60 transition-opacity duration-200 ${
								avatarLoaded ? "opacity-0" : "opacity-100"
							}`}
						></div>
						<img
							ref={imgRef}
							src={avatarSrc}
							alt={`${user.fullName} avatar`}
							className={`h-full w-full object-cover transition-opacity duration-200 ${
								avatarLoaded ? "opacity-100" : "opacity-0"
							}`}
							loading='eager'
							decoding='async'
							fetchPriority='high'
							onLoad={() => setAvatarLoaded(true)}
							onError={() => {
								setAvatarSrc(fallbackAvatar);
								setAvatarLoaded(true);
							}}
						/>
					</div>
				</div>

				<div className='space-y-3'>
					{user.role === "DEVELOPER" ? (
						<div className='rounded-xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(249,115,22,0.1))] px-4 py-3'>
							<p className='text-xs font-semibold uppercase tracking-[0.24em] text-amber-100/80'>Account status</p>
							<p className='mt-1 text-sm leading-6 text-amber-50'>
								{user.isPrimaryDeveloper
									? "Lead developer account with elevated platform control."
									: "Official developer account."}
							</p>
						</div>
					) : null}

					{user.isVerified ? (
						<div className='rounded-xl border border-sky-300/20 bg-[linear-gradient(135deg,rgba(59,130,246,0.16),rgba(6,182,212,0.1))] px-4 py-3'>
							<p className='text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/80'>Verification</p>
							<p className='mt-1 text-sm leading-6 text-sky-50'>
								This profile has a developer-assigned verified badge.
							</p>
						</div>
					) : null}

					<div className='rounded-xl border border-slate-800 bg-slate-800/80 px-4 py-3'>
						<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Username</p>
						<p className='mt-1 text-base font-medium text-slate-100'>@{user.username}</p>
					</div>

					<div className='rounded-xl border border-slate-800 bg-slate-800/80 px-4 py-3'>
						<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Gender</p>
						<p className='mt-1 text-base font-medium capitalize text-slate-100'>{user.gender || "Unknown"}</p>
					</div>

					<div className='rounded-xl border border-slate-800 bg-slate-800/80 px-4 py-3'>
						<p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-400'>Bio</p>
						<p className='mt-1 min-h-12 text-sm leading-6 text-slate-200'>
							{user.bio?.trim() || "No bio added yet."}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default UserInfoModal;
