import { connectToDatabase, prisma } from "../backend/db/prisma.js";
import { DEVELOPER_ROLE, isPrimaryDeveloperUsername } from "../backend/utils/roles.js";

const username = process.argv[2];

if (!username) {
	console.error("Usage: npm run promote:developer -- <username>");
	process.exit(1);
}

try {
	await connectToDatabase();
	const existingPrimaryDeveloper = isPrimaryDeveloperUsername(username)
		? await prisma.user.findFirst({
				where: {
					isPrimaryDeveloper: true,
					username: { not: username },
				},
				select: { id: true },
		  })
		: null;
	const isPrimaryDeveloper = isPrimaryDeveloperUsername(username) && !existingPrimaryDeveloper;

	const updatedUser = await prisma.user.update({
		where: { username },
		data: {
			role: DEVELOPER_ROLE,
			isPrimaryDeveloper,
		},
		select: {
			id: true,
			fullName: true,
			username: true,
			role: true,
			isPrimaryDeveloper: true,
		},
	});

	console.log(
		`Developer access granted to ${updatedUser.username} (${updatedUser.role}${updatedUser.isPrimaryDeveloper ? ", primary" : ""})`
	);
} catch (error) {
	console.error("Unable to promote developer:", error.message);
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
