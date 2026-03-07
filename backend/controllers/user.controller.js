import bcrypt from "bcryptjs";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { toUserDto } from "../utils/formatters.js";
import { DEVELOPER_ROLE } from "../utils/roles.js";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const getUsersForSidebar = async (req, res) => {
	try {
		const loggedInUserId = req.user._id;
		const conversations = await prisma.conversation.findMany({
			where: {
				OR: [{ userOneId: loggedInUserId }, { userTwoId: loggedInUserId }],
			},
			include: {
				messages: {
					where: {
						NOT: {
							deletedFor: {
								has: loggedInUserId,
							},
						},
					},
					orderBy: { createdAt: "desc" },
					take: 1,
					select: {
						message: true,
						audio: true,
						createdAt: true,
					},
				},
			},
		});

		const latestMessageByUserId = new Map();
		const unreadCountByUserId = new Map();
		for (const conversation of conversations) {
			const otherUserId = conversation.userOneId === loggedInUserId ? conversation.userTwoId : conversation.userOneId;
			const latestMessage = conversation.messages[0];

			if (!latestMessage) {
				continue;
			}

			latestMessageByUserId.set(otherUserId, {
				lastMessage: latestMessage.audio ? "Audio message" : latestMessage.message?.trim() || "Message",
				lastMessageAt: latestMessage.createdAt,
			});
		}

		await Promise.all(
			conversations.map(async (conversation) => {
				const otherUserId =
					conversation.userOneId === loggedInUserId ? conversation.userTwoId : conversation.userOneId;
				const unreadCount = await prisma.message.count({
					where: {
						conversationId: conversation.id,
						receiverId: loggedInUserId,
						isSeen: false,
						NOT: {
							deletedFor: {
								has: loggedInUserId,
							},
						},
					},
				});

				unreadCountByUserId.set(otherUserId, unreadCount);
			})
		);

		const users = await prisma.user.findMany({
			where: {
				id: { not: loggedInUserId },
				isArchived: false,
				isBanned: false,
			},
			select: {
				id: true,
				fullName: true,
				username: true,
				role: true,
				isVerified: true,
				verifiedAt: true,
				profilePic: true,
				gender: true,
				bio: true,
				lastSeen: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		const sidebarUsers = users
			.map((user) =>
				toUserDto({
					...user,
					...(latestMessageByUserId.get(user.id) || {
						lastMessage: null,
						lastMessageAt: null,
					}),
					unreadCount: unreadCountByUserId.get(user.id) || 0,
				})
			)
			.sort((userA, userB) => {
				const userATime = userA.lastMessageAt ? new Date(userA.lastMessageAt).getTime() : 0;
				const userBTime = userB.lastMessageAt ? new Date(userB.lastMessageAt).getTime() : 0;
				return userBTime - userATime;
			});

		res.status(200).json(sidebarUsers);
	} catch (error) {
		console.error("Error in getUsersForSidebar: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export const updateProfile = async (req, res) => {
	try {
		const userId = req.user._id;
		const { fullName, username, gender, bio, currentPassword, newPassword, confirmPassword } = req.body;

		const data = {};
		if (typeof fullName === "string" && fullName.trim()) {
			data.fullName = fullName.trim();
		}
		if (typeof username === "string" && username.trim() !== req.user.username) {
			if (req.user.role !== DEVELOPER_ROLE) {
				return res.status(403).json({ error: "Only developers can change username" });
			}

			const nextUsername = username.trim();
			if (!nextUsername) {
				return res.status(400).json({ error: "Username is required" });
			}
			if (!USERNAME_PATTERN.test(nextUsername)) {
				return res.status(400).json({
					error: "Username must be 3-20 characters and use only letters, numbers, or _",
				});
			}

			const existingUsername = await prisma.user.findUnique({
				where: { username: nextUsername },
				select: { id: true },
			});

			if (existingUsername && existingUsername.id !== userId) {
				return res.status(400).json({ error: "Username already exists" });
			}

			data.username = nextUsername;
		}
		if (typeof gender === "string" && ["male", "female"].includes(gender)) {
			data.gender = gender;
		}
		if (typeof bio === "string") {
			data.bio = bio.trim();
		}
		if (req.file?.path) {
			data.profilePic = req.file.path;
		}

		const wantsPasswordChange = currentPassword || newPassword || confirmPassword;
		if (wantsPasswordChange) {
			if (!currentPassword || !newPassword || !confirmPassword) {
				return res.status(400).json({ error: "Please fill all password fields" });
			}
			if (newPassword !== confirmPassword) {
				return res.status(400).json({ error: "Passwords don't match" });
			}
			if (newPassword.length < 6) {
				return res.status(400).json({ error: "Password must be at least 6 characters" });
			}

			const existingUser = await prisma.user.findUnique({
				where: { id: userId },
				select: { password: true },
			});
			if (!existingUser) {
				return res.status(404).json({ error: "User not found" });
			}

			const isPasswordCorrect = await bcrypt.compare(currentPassword, existingUser.password);
			if (!isPasswordCorrect) {
				return res.status(400).json({ error: "Current password is incorrect" });
			}

			const salt = await bcrypt.genSalt(10);
			data.password = await bcrypt.hash(newPassword, salt);
		}

		if (Object.keys(data).length === 0) {
			const currentUser = await prisma.user.findUnique({ where: { id: userId } });
			return res.status(200).json(toUserDto(currentUser));
		}

		const updatedUser = await prisma.user.update({
			where: { id: userId },
			data,
		});

		res.status(200).json(toUserDto(updatedUser));
	} catch (error) {
		console.error("Error in updateProfile: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};
