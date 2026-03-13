import { useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 6;

const useHorizontalDragScroll = () => {
	const containerRef = useRef(null);
	const dragStateRef = useRef(null);
	const suppressClickRef = useRef(false);
	const clearSuppressionTimerRef = useRef(null);
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		return () => {
			const dragState = dragStateRef.current;
			if (dragState) {
				window.removeEventListener("pointermove", dragState.onPointerMove);
				window.removeEventListener("pointerup", dragState.onPointerUp);
				window.removeEventListener("pointercancel", dragState.onPointerUp);
			}

			if (clearSuppressionTimerRef.current) {
				window.clearTimeout(clearSuppressionTimerRef.current);
			}

			document.body.style.userSelect = "";
		};
	}, []);

	const handlePointerDown = (event) => {
		if (event.pointerType !== "mouse" || event.button !== 0) return;

		const container = containerRef.current;
		if (!container || container.scrollWidth <= container.clientWidth) return;

		const dragState = {
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startScrollLeft: container.scrollLeft,
			moved: false,
			onPointerMove: null,
			onPointerUp: null,
		};

		const onPointerMove = (moveEvent) => {
			if (moveEvent.pointerId !== dragState.pointerId) return;

			const deltaX = moveEvent.clientX - dragState.startClientX;
			if (!dragState.moved && Math.abs(deltaX) > DRAG_THRESHOLD_PX) {
				dragState.moved = true;
				suppressClickRef.current = true;
				setIsDragging(true);
				document.body.style.userSelect = "none";
			}

			if (!dragState.moved) return;

			container.scrollLeft = dragState.startScrollLeft - deltaX;
			moveEvent.preventDefault();
		};

		const onPointerUp = (upEvent) => {
			if (upEvent.pointerId !== dragState.pointerId) return;

			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
			dragStateRef.current = null;

			document.body.style.userSelect = "";
			setIsDragging(false);

			if (!dragState.moved) return;

			if (clearSuppressionTimerRef.current) {
				window.clearTimeout(clearSuppressionTimerRef.current);
			}

			clearSuppressionTimerRef.current = window.setTimeout(() => {
				suppressClickRef.current = false;
				clearSuppressionTimerRef.current = null;
			}, 0);
		};

		dragState.onPointerMove = onPointerMove;
		dragState.onPointerUp = onPointerUp;
		dragStateRef.current = dragState;

		window.addEventListener("pointermove", onPointerMove, { passive: false });
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
	};

	const handleClickCapture = (event) => {
		if (!suppressClickRef.current) return;

		suppressClickRef.current = false;
		if (clearSuppressionTimerRef.current) {
			window.clearTimeout(clearSuppressionTimerRef.current);
			clearSuppressionTimerRef.current = null;
		}

		event.preventDefault();
		event.stopPropagation();
	};

	return {
		containerRef,
		isDragging,
		dragScrollProps: {
			onPointerDown: handlePointerDown,
			onClickCapture: handleClickCapture,
		},
	};
};

export default useHorizontalDragScroll;
