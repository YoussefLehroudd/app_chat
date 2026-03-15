import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const DEFAULT_CONNECT_TIMEOUT_SECONDS = "15";
const DEFAULT_POOL_TIMEOUT_SECONDS = "15";
const QUERY_RECONNECT_WARNING_COOLDOWN_MS = 10000;
const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);
const DATABASE_UNAVAILABLE_MESSAGE = "Database temporarily unavailable. Please retry in a moment.";
const shouldDisableNeonAdapter = process.env.PRISMA_DISABLE_NEON_ADAPTER === "true";
let databaseAvailable = false;
let lastQueryReconnectWarningAt = 0;

const isNeonDatabaseUrl = (databaseUrl) => {
	if (!databaseUrl) return false;

	try {
		return new URL(databaseUrl).hostname.endsWith(".aws.neon.tech");
	} catch {
		return false;
	}
};

const resolveDatabaseUrl = (databaseUrl) => {
	if (!databaseUrl) return databaseUrl;

	try {
		const url = new URL(databaseUrl);
		const isNeonHost = isNeonDatabaseUrl(databaseUrl);

		if (isNeonHost && !url.searchParams.has("sslmode")) {
			url.searchParams.set("sslmode", "require");
		}

		if (isNeonHost) {
			url.searchParams.delete("connect_timeout");
			url.searchParams.delete("pool_timeout");
			url.searchParams.delete("connection_limit");
			url.searchParams.delete("pgbouncer");
		}

		return url.toString();
	} catch {
		return databaseUrl;
	}
};

const runtimeDatabaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
const useNeonServerlessAdapter = isNeonDatabaseUrl(runtimeDatabaseUrl) && !shouldDisableNeonAdapter;

if (useNeonServerlessAdapter) {
	neonConfig.webSocketConstructor = ws;
}

const neonPool =
	useNeonServerlessAdapter && runtimeDatabaseUrl
		? new Pool({
				connectionString: runtimeDatabaseUrl,
				max: 5,
				connectionTimeoutMillis: Number(DEFAULT_CONNECT_TIMEOUT_SECONDS) * 1000,
				idleTimeoutMillis: Number(DEFAULT_POOL_TIMEOUT_SECONDS) * 1000,
		  })
		: null;

const prisma = new PrismaClient(
	useNeonServerlessAdapter && neonPool
		? {
				adapter: new PrismaNeon(neonPool),
		  }
		: runtimeDatabaseUrl
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
		error?.code === "ENOTFOUND" ||
		error?.code === "EAI_AGAIN" ||
		error?.code === "ENETUNREACH" ||
		error?.code === "ECONNRESET" ||
		error?.code === "ECONNREFUSED" ||
		message.includes("Timed out fetching a new connection from the connection pool") ||
		message.includes("Can't reach database server") ||
		message.includes("Server has closed the connection") ||
		message.includes("getaddrinfo ENOTFOUND") ||
		message.includes("getaddrinfo EAI_AGAIN") ||
		message.includes("ENETUNREACH") ||
		message.includes("ECONNRESET") ||
		message.includes("ECONNREFUSED")
	);
};

const isDatabaseAvailable = () => databaseAvailable;

const logQueryReconnectWarning = (queryLabel) => {
	const now = Date.now();
	if (now - lastQueryReconnectWarningAt < QUERY_RECONNECT_WARNING_COOLDOWN_MS) {
		return;
	}

	lastQueryReconnectWarningAt = now;
	console.warn(`Prisma query failed for ${queryLabel || "unknown query"}. Retrying after reconnect.`);
};

let reconnectPromise = null;

const reconnectToDatabase = async () => {
	if (!reconnectPromise) {
		reconnectPromise = (async () => {
			databaseAvailable = false;
			try {
				await prisma.$disconnect();
			} catch {
				// Ignore disconnect failures while attempting to rebuild the pool.
			}

			await wait(500);
			await prisma.$connect();
			databaseAvailable = true;
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
		logQueryReconnectWarning(queryLabel);
		await reconnectToDatabase();
		return next(params);
	}
});

const connectToDatabase = async ({ logError = true } = {}) => {
	try {
		await prisma.$connect();
		databaseAvailable = true;
		if (useNeonServerlessAdapter) {
			console.log("Using Neon serverless WebSocket adapter");
		} else if (isNeonDatabaseUrl(runtimeDatabaseUrl) && shouldDisableNeonAdapter) {
			console.log("Using Prisma native PostgreSQL connection for Neon");
		} else if (runtimeDatabaseUrl && runtimeDatabaseUrl !== process.env.DATABASE_URL) {
			console.log("Using Neon pooled runtime connection with extended timeouts");
		}
		console.log("Connected to PostgreSQL");
	} catch (error) {
		databaseAvailable = false;
		if (logError) {
			console.error("Error connecting to PostgreSQL", error.message);
		}
		throw error;
	}
};

export {
	prisma,
	connectToDatabase,
	reconnectToDatabase,
	isPrismaConnectionError,
	isDatabaseAvailable,
	DATABASE_UNAVAILABLE_MESSAGE,
};
