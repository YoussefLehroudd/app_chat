const DB_NAME = "chat-story-uploads";
const STORE_NAME = "pending_story_uploads";
const DB_VERSION = 1;

let dbPromise = null;

const openStoryUploadDb = () => {
	if (typeof window === "undefined" || !("indexedDB" in window)) {
		return Promise.resolve(null);
	}

	if (dbPromise) {
		return dbPromise;
	}

	dbPromise = new Promise((resolve, reject) => {
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "id" });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error("Failed to open story upload store"));
	});

	return dbPromise.catch((error) => {
		dbPromise = null;
		throw error;
	});
};

const runStoryUploadStoreAction = async (mode, executor) => {
	const db = await openStoryUploadDb();
	if (!db) return null;

	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, mode);
		const store = transaction.objectStore(STORE_NAME);

		transaction.oncomplete = () => resolve(result);
		transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
		transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));

		let result = null;
		executor(store, (value) => {
			result = value;
		});
	});
};

export const savePendingStoryUpload = async (upload) => {
	await runStoryUploadStoreAction("readwrite", (store) => {
		store.put(upload);
	});
};

export const deletePendingStoryUpload = async (uploadId) => {
	if (!uploadId) return;
	await runStoryUploadStoreAction("readwrite", (store) => {
		store.delete(uploadId);
	});
};

export const getPendingStoryUploads = async () => {
	const records = await runStoryUploadStoreAction("readonly", (store, setResult) => {
		const request = store.getAll();
		request.onsuccess = () => {
			setResult(Array.isArray(request.result) ? request.result : []);
		};
	});

	return Array.isArray(records) ? records : [];
};
