import { Server } from "socket.io";
import http from "http";
import express from "express";
import { isPrismaConnectionError, prisma } from "../db/prisma.js";

const app = express();

const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const io = new Server(server, {
	cors: {
		origin: allowedOrigins,
		methods: ["GET", "POST"],
	},
});

export const getReceiverSocketId = (receiverId) => {
	const sockets = userSocketMap.get(receiverId);
	if (!sockets || sockets.size === 0) return null;
	return sockets.values().next().value;
};

const userSocketMap = new Map(); // Map<userId, Set<socketId>>

const emitOnlineUsers = () => {
	io.emit("getOnlineUsers", Array.from(userSocketMap.keys()));
};

export const disconnectUserSockets = (userId, reason = "account-removed") => {
	const sockets = userSocketMap.get(userId);
	if (!sockets || sockets.size === 0) return 0;

	userSocketMap.delete(userId);

	sockets.forEach((socketId) => {
		const activeSocket = io.sockets.sockets.get(socketId);
		if (activeSocket) {
			activeSocket.emit("accountRemoved", { reason });
			activeSocket.disconnect(true);
		}
	});

	emitOnlineUsers();
	return sockets.size;
};

io.on("connection", async (socket) => {
	const userId = typeof socket.handshake.query.userId === "string" ? socket.handshake.query.userId : null;

	if (userId && userId !== "undefined") {
		try {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: { id: true, isArchived: true, isBanned: true },
			});

			if (!user) {
				socket.disconnect(true);
				return;
			}

			if (user.isArchived) {
				socket.emit("accountRemoved", { reason: "archived" });
				socket.disconnect(true);
				return;
			}

			if (user.isBanned) {
				socket.emit("accountRemoved", { reason: "banned" });
				socket.disconnect(true);
				return;
			}

			const existing = userSocketMap.get(userId) || new Set();
			existing.add(socket.id);
			userSocketMap.set(userId, existing);
		} catch (error) {
			if (isPrismaConnectionError(error)) {
				console.warn("Socket user verification skipped because the database is temporarily unavailable.");
			} else {
				console.error("Error verifying socket user:", error.message);
				socket.disconnect(true);
				return;
			}
		}
	}

	console.log("a user connected", socket.id);

	// io.emit() is used to send events to all the connected clients
	emitOnlineUsers();

	// Listen for typing events
	socket.on("typing", (receiverId) => {
		const receiverSocketId = getReceiverSocketId(receiverId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("userTyping", userId);
		}
	});

	// Listen for stop typing events
	socket.on("stopTyping", (receiverId) => {
		const receiverSocketId = getReceiverSocketId(receiverId);
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("userStopTyping", userId);
		}
	});

	// socket.on() is used to listen to the events. can be used both on client and server side
	socket.on("disconnect", () => {
		console.log("user disconnected", socket.id);
		if (userId && userId !== "undefined") {
			const existing = userSocketMap.get(userId);
			if (existing) {
				existing.delete(socket.id);
				if (existing.size === 0) {
					userSocketMap.delete(userId);
					const lastSeen = new Date();
					prisma.user
						.update({ where: { id: userId }, data: { lastSeen } })
						.then(() => {
							io.emit("userLastSeen", { userId, lastSeen: lastSeen.toISOString() });
						})
						.catch((error) => {
							if (error?.code === "P2025") {
								return;
							}
							if (isPrismaConnectionError(error)) {
								console.warn("Skipped lastSeen update because the database is temporarily unavailable.");
								return;
							}
							console.error("Error updating lastSeen:", error.message);
						});
				} else {
					userSocketMap.set(userId, existing);
				}
			}
		}
		emitOnlineUsers();
	});
});

export { app, io, server };
