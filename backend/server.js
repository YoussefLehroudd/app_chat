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
import storyRoutes from "./routes/story.routes.js";
import userRoutes from "./routes/user.routes.js";

import { connectToDatabase } from "./db/prisma.js";
import { app, server } from "./socket/socket.js";
// PORT should be assigned after calling dotenv.config() because we need to access the env variables. Didn't realize while recording the video. Sorry for the confusion.
const PORT = process.env.PORT || 5000;
const DATABASE_INITIAL_RETRY_DELAY_MS = 5000;
const DATABASE_MAX_RETRY_DELAY_MS = 30000;

let databaseRetryTimeout = null;
let databaseReconnectDelayMs = DATABASE_INITIAL_RETRY_DELAY_MS;

app.use(express.json()); // to parse the incoming requests with JSON payloads (from req.body)
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/developer", developerRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/users", userRoutes);

app.use(express.static(path.join(__dirname, "..", "frontend", "dist")));

app.get("*", (req, res) => {
	res.sendFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
});

const scheduleDatabaseReconnect = () => {
	if (databaseRetryTimeout) return;

	const retryDelayMs = databaseReconnectDelayMs;
	databaseRetryTimeout = setTimeout(async () => {
		databaseRetryTimeout = null;
		try {
			await connectToDatabase({ logError: false });
			databaseReconnectDelayMs = DATABASE_INITIAL_RETRY_DELAY_MS;
			console.log("Database connection restored");
		} catch (error) {
			console.error(`Database reconnect failed. Retrying in ${retryDelayMs / 1000}s.`, error.message);
			databaseReconnectDelayMs = Math.min(retryDelayMs * 2, DATABASE_MAX_RETRY_DELAY_MS);
			scheduleDatabaseReconnect();
		}
	}, retryDelayMs);
};

const startServer = () => {
	try {
		server.listen(PORT, () => {
			console.log(`Server Running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Failed to start HTTP server", error.message);
		process.exit(1);
	}
};

server.on("error", (error) => {
	console.error("HTTP server error", error.message);
});

startServer();

connectToDatabase({ logError: false })
	.then(() => {
		databaseReconnectDelayMs = DATABASE_INITIAL_RETRY_DELAY_MS;
	})
	.catch((error) => {
		console.error(
			`Initial database connection failed. Server will keep running and retry from ${DATABASE_INITIAL_RETRY_DELAY_MS / 1000}s with backoff.`,
			error.message
		);
		scheduleDatabaseReconnect();
	});
