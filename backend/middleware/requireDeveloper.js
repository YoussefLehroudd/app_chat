import { DEVELOPER_ROLE } from "../utils/roles.js";

const requireDeveloper = (req, res, next) => {
	if (req.user?.role !== DEVELOPER_ROLE) {
		return res.status(403).json({ error: "Developer access required" });
	}

	next();
};

export default requireDeveloper;
