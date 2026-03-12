import { useEffect } from "react";

const MODAL_OPEN_COUNT_KEY = "modalOpenCount";

const parseModalOpenCount = () => Number.parseInt(document.body.dataset[MODAL_OPEN_COUNT_KEY] || "0", 10) || 0;

const useModalBodyScrollLock = (isOpen) => {
	useEffect(() => {
		if (!isOpen || typeof document === "undefined") return undefined;

		const currentOpenCount = parseModalOpenCount();
		document.body.dataset[MODAL_OPEN_COUNT_KEY] = String(currentOpenCount + 1);
		document.body.classList.add("app-modal-open");

		return () => {
			const nextOpenCount = parseModalOpenCount() - 1;
			if (nextOpenCount <= 0) {
				delete document.body.dataset[MODAL_OPEN_COUNT_KEY];
				document.body.classList.remove("app-modal-open");
				return;
			}

			document.body.dataset[MODAL_OPEN_COUNT_KEY] = String(nextOpenCount);
		};
	}, [isOpen]);
};

export default useModalBodyScrollLock;
