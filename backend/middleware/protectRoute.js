import jwt from "jsonwebtoken";
import { DATABASE_UNAVAILABLE_MESSAGE, isPrismaConnectionError, prisma } from "../db/prisma.js";
import { toUserDto } from "../utils/formatters.js";

const protectRoute = async (req, res, next) => {
	try {
		const token = req.cookies.jwt;

		if (!token) {
			return res.status(401).json({ error: "Unauthorized - No Token Provided" });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		if (!decoded) {
			return res.status(401).json({ error: "Unauthorized - Invalid Token" });
		}

		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		if (user.isArchived) {
			res.cookie("jwt", "", { maxAge: 0 });
			return res.status(403).json({
				error: "Your account has been banned",
			});
		}

		if (user.isBanned) {
			res.cookie("jwt", "", { maxAge: 0 });
			return res.status(403).json({
				error: "Your account has been banned",
			});
		}

		req.user = toUserDto(user, { includeDeveloperPermissions: true });

		next();
	} catch (error) {
		console.log("Error in protectRoute middleware: ", error.message);
		if (isPrismaConnectionError(error)) {
			return res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
		}
		res.status(500).json({ error: "Internal server error" });
	}
};

export default protectRoute;
