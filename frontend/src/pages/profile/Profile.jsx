import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
	IoArrowBack,
	IoCameraOutline,
	IoCheckmarkCircle,
	IoCloudUploadOutline,
	IoLockClosedOutline,
	IoMaleFemaleOutline,
	IoPersonOutline,
	IoSparklesOutline,
} from "react-icons/io5";
import { useAuthContext } from "../../context/AuthContext";
import useUpdateProfile from "../../hooks/useUpdateProfile";
import getDefaultAvatar from "../../utils/defaultAvatar";
import { getAvatarUrl } from "../../utils/avatar";

const genderOptions = [
	{
		value: "male",
		label: "Male",
		description: "Classic blue default avatar if no custom image is used.",
	},
	{
		value: "female",
		label: "Female",
		description: "Pink default avatar if no custom image is used.",
	},
];

const formatJoinDate = (dateValue) => {
	if (!dateValue) return "Recently joined";

	try {
		return new Intl.DateTimeFormat("en", {
			month: "short",
			day: "numeric",
			year: "numeric",
		}).format(new Date(dateValue));
	} catch {
		return "Recently joined";
	}
};

const Profile = () => {
	const { authUser } = useAuthContext();
	const { loading, updateProfile } = useUpdateProfile();

	const fileInputRef = useRef(null);
	const uploadedPreviewRef = useRef(null);

	const resolvedProfilePic = getAvatarUrl(authUser?.profilePic, 256);

	const [fullName, setFullName] = useState(authUser?.fullName || "");
	const [username, setUsername] = useState(authUser?.username || "");
	const [gender, setGender] = useState(authUser?.gender || "male");
	const [bio, setBio] = useState(authUser?.bio || "");
	const [profilePicFile, setProfilePicFile] = useState(null);
	const [profilePreview, setProfilePreview] = useState(resolvedProfilePic || "");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	useEffect(() => {
		setFullName(authUser?.fullName || "");
		setUsername(authUser?.username || "");
		setGender(authUser?.gender || "male");
		setBio(authUser?.bio || "");
		setProfilePreview(getAvatarUrl(authUser?.profilePic, 256) || "");
		setProfilePicFile(null);
	}, [authUser]);

	useEffect(() => {
		return () => {
			if (uploadedPreviewRef.current) {
				URL.revokeObjectURL(uploadedPreviewRef.current);
			}
		};
	}, []);

	if (!authUser) return null;

	const isDeveloper = authUser.role === "DEVELOPER";
	const fallbackAvatar = getDefaultAvatar(gender);
	const previewSrc = profilePreview || resolvedProfilePic || fallbackAvatar;
	const joinedAtLabel = formatJoinDate(authUser.createdAt);
	const profileCompletion = Math.round(
		([fullName.trim(), gender, bio.trim(), previewSrc].filter(Boolean).length / 4) * 100
	);
	const bioCharacters = bio.trim().length;
	const hasPasswordDraft = Boolean(currentPassword || newPassword || confirmPassword);

	const handleFileChange = (event) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (uploadedPreviewRef.current) {
			URL.revokeObjectURL(uploadedPreviewRef.current);
		}

		const objectUrl = URL.createObjectURL(file);
		uploadedPreviewRef.current = objectUrl;

		setProfilePicFile(file);
		setProfilePreview(objectUrl);
	};

	const handleResetPreview = () => {
		if (uploadedPreviewRef.current) {
			URL.revokeObjectURL(uploadedPreviewRef.current);
			uploadedPreviewRef.current = null;
		}

		setProfilePicFile(null);
		setProfilePreview(resolvedProfilePic || "");
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleSubmit = async (event) => {
		event.preventDefault();

		const updatedUser = await updateProfile({
			fullName,
			username,
			gender,
			bio,
			profilePicFile,
			currentPassword,
			newPassword,
			confirmPassword,
		});

		if (!updatedUser) return;

		if (uploadedPreviewRef.current) {
			URL.revokeObjectURL(uploadedPreviewRef.current);
			uploadedPreviewRef.current = null;
		}

		setProfilePicFile(null);
		setProfilePreview(getAvatarUrl(updatedUser.profilePic, 256) || "");
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const shellCardClassName =
		"relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,14,28,0.92),rgba(8,15,30,0.7))] shadow-[0_28px_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl";
	const panelClassName =
		"relative shrink-0 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,30,0.88),rgba(13,24,42,0.68))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.36)] backdrop-blur-2xl sm:p-6 lg:p-7";
	const fieldClassName =
		"h-14 w-full rounded-[20px] border border-white/10 bg-slate-950/35 px-4 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55";
	const textAreaClassName =
		"custom-scrollbar min-h-[150px] w-full rounded-[24px] border border-white/10 bg-slate-950/35 px-4 py-4 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:bg-slate-950/55";
	const labelClassName =
		"mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400";

	return (
		<div className='relative flex h-full min-h-0 w-full flex-1 overflow-hidden'>
			<div className='pointer-events-none absolute inset-0 overflow-hidden'>
				<div className='absolute left-[-10%] top-[-12%] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl'></div>
				<div className='absolute bottom-[-14%] right-[-8%] h-96 w-96 rounded-full bg-orange-400/10 blur-3xl'></div>
				<div className='absolute left-[42%] top-[24%] h-48 w-48 rounded-full bg-sky-300/8 blur-3xl'></div>
			</div>

			<div className='relative mx-auto flex h-full w-full max-w-[1540px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6'>
				<div className={`${shellCardClassName} flex h-full min-h-0 flex-col p-3 sm:p-4 lg:p-5`}>
					<div className='pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/35 to-transparent'></div>
					<div className='custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pr-1'>

					<div className='flex flex-col gap-3 rounded-[26px] border border-white/8 bg-white/[0.03] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-6'>
						<div className='max-w-2xl'>
							<div className='inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-200'>
								<IoSparklesOutline className='h-4 w-4' />
								Account studio
							</div>
							<h1 className='mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl'>
								Refresh your profile presence
							</h1>
							<p className='mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-[15px]'>
								Update your identity card, avatar, and password from one place. The layout is optimized for
								quick edits on desktop and mobile.
							</p>
						</div>

						<Link
							to='/'
							className='inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-300/30 hover:bg-white/[0.08]'
						>
							<IoArrowBack className='h-4 w-4' />
							Back to chats
						</Link>
					</div>

					<div className='mt-4 grid min-h-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(0,1fr)]'>
						<aside className='flex min-h-0 flex-col gap-4'>
							<div className={`${panelClassName} lg:sticky lg:top-0`}>
								<div className='pointer-events-none absolute right-[-20%] top-[-14%] h-44 w-44 rounded-full bg-sky-400/10 blur-3xl'></div>
								<div className='pointer-events-none absolute bottom-[-18%] left-[-10%] h-40 w-40 rounded-full bg-cyan-300/10 blur-3xl'></div>

								<div className='relative'>
									<div className='flex items-start justify-between gap-4'>
										<div className='space-y-2'>
											<p className='text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400'>
												Live identity
											</p>
											<h2 className='text-2xl font-semibold text-white'>{fullName || authUser.fullName}</h2>
											<p className='text-sm text-slate-400'>@{username || authUser.username}</p>
										</div>
										<div className='rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200'>
											{profileCompletion}% complete
										</div>
									</div>

									<div className='mt-6 flex flex-col items-center rounded-[28px] border border-white/8 bg-slate-950/32 px-5 py-6 text-center'>
										<div className='relative'>
											<div className='absolute inset-0 rounded-full bg-sky-400/20 blur-2xl'></div>
											<div className='relative h-32 w-32 overflow-hidden rounded-full border border-white/10 bg-slate-900 shadow-[0_18px_48px_rgba(2,6,23,0.35)]'>
												<img
													src={previewSrc}
													alt='Profile preview'
													className='h-full w-full object-cover'
													onError={(event) => {
														event.currentTarget.src = fallbackAvatar;
													}}
												/>
											</div>
											<button
												type='button'
												onClick={() => fileInputRef.current?.click()}
												className='absolute bottom-1 right-1 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-sky-500 text-white shadow-[0_16px_34px_rgba(14,165,233,0.3)] transition hover:bg-sky-400'
												title='Change photo'
											>
												<IoCameraOutline className='h-5 w-5' />
											</button>
										</div>

										<p className='mt-5 text-lg font-semibold text-white'>Profile preview</p>
										<p className='mt-2 text-sm leading-6 text-slate-400'>
											{profilePicFile
												? `Selected: ${profilePicFile.name}`
												: "Use a sharp square image to keep the avatar crisp in chats and sidebars."}
										</p>

										<div className='mt-5 flex w-full flex-wrap items-center justify-center gap-2'>
											<button
												type='button'
												onClick={() => fileInputRef.current?.click()}
												className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]'
											>
												<IoCloudUploadOutline className='h-4 w-4' />
												Upload photo
											</button>
											{profilePicFile ? (
												<button
													type='button'
													onClick={handleResetPreview}
													className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-100'
												>
													Reset preview
												</button>
											) : null}
										</div>
									</div>

									<div className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'>
										<div className='rounded-[24px] border border-white/8 bg-white/[0.035] p-4'>
											<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
												Member since
											</p>
											<p className='mt-3 text-lg font-semibold text-white'>{joinedAtLabel}</p>
										</div>
										<div className='rounded-[24px] border border-white/8 bg-white/[0.035] p-4'>
											<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
												Security
											</p>
											<p className='mt-3 text-lg font-semibold text-white'>
												{hasPasswordDraft ? "Password pending" : "Protected"}
											</p>
										</div>
									</div>

									<div className='mt-5 rounded-[24px] border border-white/8 bg-[linear-gradient(135deg,rgba(14,165,233,0.1),rgba(8,15,30,0.3))] p-4'>
										<div className='flex items-start gap-3'>
											<div className='mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200'>
												<IoCheckmarkCircle className='h-5 w-5' />
											</div>
											<div>
												<p className='text-sm font-semibold text-white'>Profile notes</p>
												<p className='mt-2 text-sm leading-6 text-slate-300'>
													{isDeveloper
														? "As a developer, you can also rename your username here. Full name, gender, bio, image, and password stay editable as usual."
														: "Username stays locked for consistency. Full name, gender, bio, image, and password can be changed here any time."}
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</aside>

						<form onSubmit={handleSubmit} className='flex flex-col gap-4'>
							<div className={panelClassName}>
								<div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]'>
									<section className='rounded-[28px] border border-white/8 bg-slate-950/28 p-4 sm:p-5'>
										<p className={labelClassName}>
											<IoPersonOutline className='h-4 w-4' />
											Identity
										</p>

										<div className='grid gap-4 md:grid-cols-2'>
											<div>
												<label className='mb-2 block text-sm font-medium text-slate-200'>Full name</label>
												<input
													type='text'
													className={fieldClassName}
													value={fullName}
													onChange={(event) => setFullName(event.target.value)}
													placeholder='Your display name'
												/>
											</div>

											<div>
												<label className='mb-2 block text-sm font-medium text-slate-200'>Username</label>
												<input
													type='text'
													className={`${fieldClassName} ${isDeveloper ? "" : "cursor-not-allowed opacity-70"}`}
													value={username}
													onChange={(event) => setUsername(event.target.value)}
													disabled={!isDeveloper}
													maxLength='20'
												/>
												<p className='mt-2 text-xs text-slate-500'>
													{isDeveloper
														? "Developer-only: letters, numbers, and _ only."
														: "Only developer accounts can change username."}
												</p>
											</div>
										</div>

										<div className='mt-5'>
											<div className='mb-3 flex items-center justify-between gap-3'>
												<label className='text-sm font-medium text-slate-200'>Bio</label>
												<span className='text-xs font-medium text-slate-500'>{bioCharacters}/240</span>
											</div>
											<textarea
												className={textAreaClassName}
												rows='5'
												maxLength='240'
												value={bio}
												onChange={(event) => setBio(event.target.value)}
												placeholder='Write a short intro that appears in your profile card.'
											/>
										</div>
									</section>

									<section className='rounded-[28px] border border-white/8 bg-slate-950/28 p-4 sm:p-5'>
										<p className={labelClassName}>
											<IoCloudUploadOutline className='h-4 w-4' />
											Photo
										</p>

										<input
											ref={fileInputRef}
											type='file'
											accept='image/*'
											onChange={handleFileChange}
											className='hidden'
										/>

										<button
											type='button'
											onClick={() => fileInputRef.current?.click()}
											className='flex w-full items-center justify-between gap-4 rounded-[24px] border border-dashed border-white/12 bg-white/[0.03] p-4 text-left transition hover:border-sky-300/30 hover:bg-white/[0.05]'
										>
											<div>
												<p className='text-sm font-semibold text-white'>Choose a fresh avatar</p>
												<p className='mt-1 text-sm leading-6 text-slate-400'>
													PNG or JPG, up to 5MB. Square photos work best in the chat UI.
												</p>
											</div>
											<div className='inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-200'>
												<IoCameraOutline className='h-5 w-5' />
											</div>
										</button>

										<div className='mt-5 rounded-[24px] border border-white/8 bg-slate-950/32 p-4'>
											<p className='text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500'>
												Current file
											</p>
											<p className='mt-3 break-words text-sm font-medium text-slate-200'>
												{profilePicFile ? profilePicFile.name : "No new file selected"}
											</p>
										</div>

										<div className='mt-5 space-y-3'>
											{genderOptions.map((option) => {
												const isActive = gender === option.value;

												return (
													<button
														key={option.value}
														type='button'
														onClick={() => setGender(option.value)}
														className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
															isActive
																? "border-sky-300/40 bg-[linear-gradient(135deg,rgba(14,165,233,0.18),rgba(6,182,212,0.12))] shadow-[0_18px_36px_rgba(14,165,233,0.12)]"
																: "border-white/8 bg-white/[0.025] hover:border-white/12 hover:bg-white/[0.04]"
														}`}
													>
														<div className='flex items-start gap-3'>
															<div
																className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
																	isActive ? "bg-sky-500/18 text-sky-200" : "bg-white/[0.05] text-slate-300"
																}`}
															>
																<IoMaleFemaleOutline className='h-5 w-5' />
															</div>
															<div>
																<div className='flex items-center gap-2'>
																	<p className='text-sm font-semibold text-white'>{option.label}</p>
																	{isActive ? (
																		<span className='rounded-full border border-sky-300/30 bg-sky-400/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100'>
																			Selected
																		</span>
																	) : null}
																</div>
																<p className='mt-1 text-sm leading-6 text-slate-400'>{option.description}</p>
															</div>
														</div>
													</button>
												);
											})}
										</div>
									</section>
								</div>
							</div>

							<div className={panelClassName}>
								<div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
									<div className='max-w-xl'>
										<p className={labelClassName}>
											<IoLockClosedOutline className='h-4 w-4' />
											Security
										</p>
										<h2 className='text-2xl font-semibold text-white'>Change your password</h2>
										<p className='mt-3 text-sm leading-7 text-slate-400'>
											Leave these fields empty if you only want to update your public profile. New passwords must
											match before the form can be saved.
										</p>
									</div>

									<div className='rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-slate-300'>
										{hasPasswordDraft ? "Security update in progress" : "No pending password changes"}
									</div>
								</div>

								<div className='mt-5 grid gap-4 xl:grid-cols-3'>
									<div>
										<label className='mb-2 block text-sm font-medium text-slate-200'>Current password</label>
										<input
											type='password'
											className={fieldClassName}
											placeholder='Current password'
											value={currentPassword}
											onChange={(event) => setCurrentPassword(event.target.value)}
										/>
									</div>

									<div>
										<label className='mb-2 block text-sm font-medium text-slate-200'>New password</label>
										<input
											type='password'
											className={fieldClassName}
											placeholder='New password'
											value={newPassword}
											onChange={(event) => setNewPassword(event.target.value)}
										/>
									</div>

									<div>
										<label className='mb-2 block text-sm font-medium text-slate-200'>Confirm password</label>
										<input
											type='password'
											className={fieldClassName}
											placeholder='Confirm new password'
											value={confirmPassword}
											onChange={(event) => setConfirmPassword(event.target.value)}
										/>
									</div>
								</div>
							</div>

							<div className='flex flex-col gap-3 rounded-[26px] border border-white/10 bg-white/[0.03] px-4 py-4 shadow-[0_22px_52px_rgba(2,6,23,0.24)] sm:flex-row sm:items-center sm:justify-between sm:px-5'>
								<div>
									<p className='text-sm font-semibold text-white'>Ready to save?</p>
									<p className='mt-1 text-sm text-slate-400'>
										Your profile updates are reflected in the sidebar, chat header, and user card.
									</p>
								</div>

								<div className='flex flex-wrap items-center gap-3'>
									<button
										type='button'
										onClick={handleResetPreview}
										className='inline-flex items-center justify-center rounded-full border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05]'
									>
										Reset photo
									</button>
									<button
										type='submit'
										disabled={loading}
										className='inline-flex min-w-[180px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(14,165,233,0.28)] transition hover:from-sky-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-70'
									>
										{loading ? <span className='loading loading-spinner loading-sm'></span> : null}
										{loading ? "Saving..." : "Save changes"}
									</button>
								</div>
							</div>
						</form>
					</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Profile;
