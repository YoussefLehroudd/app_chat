import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from "express";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import callRoutes from "./routes/call.routes.js";
import conversationRoutes from "./routes/conversation.routes.js";
import developerRoutes from "./routes/developer.routes.js";
import messageRoutes from "./routes/message.routes.js";
import userRoutes from "./routes/user.routes.js";

import { connectToDatabase } from "./db/prisma.js";
import { app, server } from "./socket/socket.js";
// PORT should be assigned after calling dotenv.config() because we need to access the env variables. Didn't realize while recording the video. Sorry for the confusion.
const PORT = process.env.PORT || 5000;

app.use(express.json()); // to parse the incoming requests with JSON payloads (from req.body)
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/developer", developerRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);

app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));

app.get("*", (req, res) => {
	res.sendFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
});

const startServer = async () => {
	try {
		await connectToDatabase();
		server.listen(PORT, () => {
			console.log(`Server Running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Failed to connect to database", error.message);
		process.exit(1); // Exit process with failure
	}
};

startServer();
