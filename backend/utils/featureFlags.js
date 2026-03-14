import crypto from "crypto";

const buildFeatureFlagBucket = (userId, flagKey) => {
	const digest = crypto.createHash("sha256").update(`${userId}:${flagKey}`).digest("hex");
	const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100;
	return bucket;
};

const isFeatureFlagActiveForUser = (flag, user) => {
	if (!flag?.isEnabled || !user?.id) {
		return false;
	}

	if (Array.isArray(flag.allowListUserIds) && flag.allowListUserIds.includes(user.id)) {
		return true;
	}

	if (Array.isArray(flag.targetRoles) && flag.targetRoles.length > 0 && !flag.targetRoles.includes(user.role)) {
		return false;
	}

	const rolloutPercent = Number.isFinite(flag.rolloutPercent) ? flag.rolloutPercent : 0;
	if (rolloutPercent <= 0) {
		return false;
	}

	return buildFeatureFlagBucket(user.id, flag.key) < rolloutPercent;
};

const mapResolvedFeatureFlag = (flag, user) => ({
	key: flag.key,
	name: flag.name,
	description: flag.description ?? "",
	isEnabled: isFeatureFlagActiveForUser(flag, user),
	rolloutPercent: flag.rolloutPercent ?? 0,
});

export { isFeatureFlagActiveForUser, mapResolvedFeatureFlag };
