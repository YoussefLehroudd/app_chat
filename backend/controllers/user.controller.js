import bcrypt from "bcryptjs";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { toUserDto } from "../utils/formatters.js";
import { DEVELOPER_ROLE } from "../utils/roles.js";
import { CONVERSATION_TYPES, DIRECT_CONVERSATION_STATUSES } from "../utils/conversations.js";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export const getSelectableUsers = async (req, res) => {
	try {
		const loggedInUserId = req.user._id;
		const scope = typeof req.query?.scope === "string" ? req.query.scope.trim().toLowerCase() : "all";
		const userSelect = {
			id: true,
			fullName: true,
			username: true,
			isArchived: true,
			isBanned: true,
			role: true,
			isPrimaryDeveloper: true,
			isVerified: true,
			verifiedAt: true,
			profilePic: true,
			gender: true,
			bio: true,
			lastSeen: true,
			createdAt: true,
			updatedAt: true,
		};

		let users = [];
		if (scope === "contacts") {
			const directConversations = await prisma.conversation.findMany({
				where: {
					type: CONVERSATION_TYPES.DIRECT,
					directStatus: DIRECT_CONVERSATION_STATUSES.ACCEPTED,
					OR: [{ userOneId: loggedInUserId }, { userTwoId: loggedInUserId }],
				},
				select: {
					userOneId: true,
					userTwoId: true,
					userOne: { select: userSelect },
					userTwo: { select: userSelect },
				},
			});

			const contactMap = new Map();
			for (const conversation of directConversations) {
				const counterpart =
					conversation.userOneId === loggedInUserId ? conversation.userTwo : conversation.userOne;
				if (!counterpart) continue;
				if (counterpart.id === loggedInUserId) continue;
				if (counterpart.isArchived || counterpart.isBanned) continue;
				if (!contactMap.has(counterpart.id)) {
					contactMap.set(counterpart.id, counterpart);
				}
			}

			users = Array.from(contactMap.values()).sort((userA, userB) => {
				const nameCompare = (userA.fullName || "").localeCompare(userB.fullName || "");
				if (nameCompare !== 0) return nameCompare;
				return (userA.username || "").localeCompare(userB.username || "");
			});
		} else {
			users = await prisma.user.findMany({
				where: {
					id: { not: loggedInUserId },
					isArchived: false,
					isBanned: false,
				},
				select: userSelect,
				orderBy: [{ fullName: "asc" }, { username: "asc" }],
			});
		}

		res.status(200).json(users.map((user) => toUserDto(user)));
	} catch (error) {
		console.error("Error in getSelectableUsers:", error.message);
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
		console.error("Error in updateProfile:", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};
