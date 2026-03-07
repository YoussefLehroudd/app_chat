import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const DEFAULT_CONNECT_TIMEOUT_SECONDS = "15";
const DEFAULT_POOL_TIMEOUT_SECONDS = "15";
const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1017"]);
const DATABASE_UNAVAILABLE_MESSAGE = "Database temporarily unavailable. Please retry in a moment.";

const resolveDatabaseUrl = (databaseUrl) => {
	if (!databaseUrl) return databaseUrl;

	try {
		const url = new URL(databaseUrl);
		const isNeonHost = url.hostname.endsWith(".aws.neon.tech");

		if (isNeonHost && !url.hostname.includes("-pooler.")) {
			const firstDotIndex = url.hostname.indexOf(".");
			if (firstDotIndex !== -1) {
				url.hostname = `${url.hostname.slice(0, firstDotIndex)}-pooler${url.hostname.slice(firstDotIndex)}`;
			}
		}

		if (isNeonHost) {
			if (!url.searchParams.has("connect_timeout")) {
				url.searchParams.set("connect_timeout", DEFAULT_CONNECT_TIMEOUT_SECONDS);
			}
			if (!url.searchParams.has("pool_timeout")) {
				url.searchParams.set("pool_timeout", DEFAULT_POOL_TIMEOUT_SECONDS);
			}
		}

		return url.toString();
	} catch {
		return databaseUrl;
	}
};

const runtimeDatabaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient(
	runtimeDatabaseUrl
		? {
				datasources: {
					db: {
						url: runtimeDatabaseUrl,
					},
				},
		  }
		: undefined
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPrismaConnectionError = (error) => {
	const message = error?.message || "";
	return (
		RETRYABLE_PRISMA_CODES.has(error?.code) ||
		message.includes("Can't reach database server") ||
		message.includes("Server has closed the connection")
	);
};

let reconnectPromise = null;

const reconnectToDatabase = async () => {
	if (!reconnectPromise) {
		reconnectPromise = (async () => {
			try {
				await prisma.$disconnect();
			} catch {
				// Ignore disconnect failures while attempting to rebuild the pool.
			}

			await wait(500);
			await prisma.$connect();
		})().finally(() => {
			reconnectPromise = null;
		});
	}

	return reconnectPromise;
};

prisma.$use(async (params, next) => {
	try {
		return await next(params);
	} catch (error) {
		if (!isPrismaConnectionError(error)) {
			throw error;
		}

		const queryLabel = [params.model, params.action].filter(Boolean).join(".");
		console.warn(`Prisma query failed for ${queryLabel || "unknown query"}. Retrying after reconnect.`);
		await reconnectToDatabase();
		return next(params);
	}
});

const connectToDatabase = async () => {
	try {
		await prisma.$connect();
		if (runtimeDatabaseUrl && runtimeDatabaseUrl !== process.env.DATABASE_URL) {
			console.log("Using Neon pooled runtime connection with extended timeouts");
		}
		console.log("Connected to PostgreSQL");
	} catch (error) {
		console.error("Error connecting to PostgreSQL", error.message);
		throw error;
	}
};

export {
	prisma,
	connectToDatabase,
	reconnectToDatabase,
	isPrismaConnectionError,
	DATABASE_UNAVAILABLE_MESSAGE,
};
