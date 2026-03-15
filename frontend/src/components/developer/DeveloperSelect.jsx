import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IoCheckmarkOutline, IoChevronDownOutline } from "react-icons/io5";

const normalizeOption = (option) => {
	if (typeof option === "string") {
		return {
			value: option,
			label: option.replaceAll("_", " "),
			description: "",
			disabled: false,
		};
	}

	return {
		value: option?.value ?? "",
		label: option?.label ?? String(option?.value ?? ""),
		description: option?.description ?? "",
		disabled: Boolean(option?.disabled),
	};
};

const DeveloperSelect = ({
	value,
	onChange,
	options,
	disabled = false,
	placeholder = "Select an option",
	ariaLabel,
	size = "md",
	className = "",
	menuClassName = "",
}) => {
	const rootRef = useRef(null);
	const menuRef = useRef(null);
	const [isOpen, setIsOpen] = useState(false);
	const [menuPlacement, setMenuPlacement] = useState("bottom");
	const [menuMaxHeight, setMenuMaxHeight] = useState(320);
	const [menuLayout, setMenuLayout] = useState({
		left: 0,
		top: 0,
		bottom: "auto",
		width: 0,
	});

	const normalizedOptions = useMemo(() => options.map(normalizeOption), [options]);
	const selectedOption = normalizedOptions.find((option) => String(option.value) === String(value)) || null;

	useEffect(() => {
		if (!isOpen) return undefined;

		const updateMenuLayout = () => {
			const rootElement = rootRef.current;
			if (!rootElement) return;

			const rootRect = rootElement.getBoundingClientRect();
			const viewportHeight = window.innerHeight;
			const viewportWidth = window.innerWidth;
			const menuHeight = menuRef.current?.offsetHeight || 0;
			const gap = 8;
			const spaceBelow = viewportHeight - rootRect.bottom - 16;
			const spaceAbove = rootRect.top - 16;
			const shouldOpenUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
			const nextMaxHeight = Math.max(Math.min((shouldOpenUpward ? spaceAbove : spaceBelow) - 12, 320), 176);
			const nextWidth = Math.min(rootRect.width, viewportWidth - 24);
			const nextLeft = Math.min(Math.max(rootRect.left, 12), viewportWidth - nextWidth - 12);
			const cappedMenuHeight = Math.min(menuHeight || nextMaxHeight, nextMaxHeight);
			const nextTop = shouldOpenUpward
				? Math.max(rootRect.top - cappedMenuHeight - gap, 12)
				: Math.min(rootRect.bottom + gap, viewportHeight - cappedMenuHeight - 12);

			setMenuPlacement(shouldOpenUpward ? "top" : "bottom");
			setMenuMaxHeight(nextMaxHeight);
			setMenuLayout({
				left: nextLeft,
				top: nextTop,
				bottom: "auto",
				width: nextWidth,
			});
		};

		const handlePointerDown = (event) => {
			const clickedInsideRoot = rootRef.current?.contains(event.target);
			const clickedInsideMenu = menuRef.current?.contains(event.target);
			if (!clickedInsideRoot && !clickedInsideMenu) {
				setIsOpen(false);
			}
		};

		const handleEscape = (event) => {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};

		updateMenuLayout();
		requestAnimationFrame(updateMenuLayout);
		document.addEventListener("mousedown", handlePointerDown);
		window.addEventListener("keydown", handleEscape);
		window.addEventListener("resize", updateMenuLayout);
		window.addEventListener("scroll", updateMenuLayout, true);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			window.removeEventListener("keydown", handleEscape);
			window.removeEventListener("resize", updateMenuLayout);
			window.removeEventListener("scroll", updateMenuLayout, true);
		};
	}, [isOpen]);

	const triggerSizeClassName =
		size === "sm" ? "h-11 rounded-[16px] px-4 text-sm" : "h-12 rounded-[18px] px-4 text-sm";

	return (
		<div ref={rootRef} className={`relative w-full min-w-0 ${className}`}>
			<button
				type='button'
				onClick={() => {
					if (disabled) return;
					setIsOpen((currentValue) => !currentValue);
				}}
				disabled={disabled}
				aria-label={ariaLabel}
				aria-haspopup='listbox'
				aria-expanded={isOpen}
				className={`flex w-full min-w-0 items-center justify-between gap-3 border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.38),rgba(15,23,42,0.42))] text-left text-slate-100 outline-none transition hover:border-white/20 hover:bg-slate-950/55 focus-visible:border-sky-400/40 focus-visible:bg-slate-950/55 disabled:cursor-not-allowed disabled:opacity-60 ${triggerSizeClassName} ${
					isOpen ? "border-sky-300/30 bg-slate-950/60 shadow-[0_18px_42px_rgba(8,15,30,0.34)]" : ""
				}`}
			>
				<span className='min-w-0 flex-1'>
					<span className={`block truncate font-medium ${selectedOption ? "text-slate-100" : "text-slate-500"}`}>
						{selectedOption?.label || placeholder}
					</span>
					{selectedOption?.description ? (
						<span className='mt-0.5 block truncate text-[11px] text-slate-500'>{selectedOption.description}</span>
					) : null}
				</span>
				<IoChevronDownOutline
					className={`h-4.5 w-4.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180 text-sky-200" : ""}`}
				/>
			</button>

			{isOpen
				? createPortal(
						<div
							ref={menuRef}
							className={`fixed z-[240] overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,23,0.98),rgba(3,8,20,0.98))] p-2 shadow-[0_24px_64px_rgba(2,6,23,0.56)] ${menuClassName}`}
							style={{
								left: `${menuLayout.left}px`,
								top: typeof menuLayout.top === "number" ? `${menuLayout.top}px` : "auto",
								bottom: typeof menuLayout.bottom === "number" ? `${menuLayout.bottom}px` : "auto",
								width: `${menuLayout.width}px`,
								maxHeight: `${menuMaxHeight}px`,
							}}
							role='listbox'
							data-placement={menuPlacement}
						>
							<div
								className='chat-scrollbar min-h-0 space-y-1 overflow-y-auto pr-1'
								style={{ maxHeight: `${Math.max(menuMaxHeight - 16, 140)}px` }}
							>
								{normalizedOptions.map((option) => {
									const isSelected = String(option.value) === String(value);
									return (
										<button
											key={`${option.value}-${option.label}`}
											type='button'
											disabled={option.disabled}
											onClick={() => {
												if (option.disabled) return;
												onChange(option.value);
												setIsOpen(false);
											}}
											className={`flex w-full items-start justify-between gap-3 rounded-[16px] px-3 py-3 text-left transition ${
												option.disabled
													? "cursor-not-allowed opacity-45"
													: isSelected
														? "border border-sky-300/22 bg-sky-500/12 text-white"
														: "border border-transparent bg-white/[0.02] text-slate-200 hover:border-white/10 hover:bg-white/[0.05]"
											}`}
										>
											<span className='min-w-0 flex-1'>
												<span className='block whitespace-normal text-sm font-medium leading-5'>{option.label}</span>
												{option.description ? (
													<span className='mt-1 block whitespace-normal text-xs leading-5 text-slate-400'>
														{option.description}
													</span>
												) : null}
											</span>
											{isSelected ? <IoCheckmarkOutline className='mt-0.5 h-4.5 w-4.5 shrink-0 text-sky-200' /> : null}
										</button>
									);
								})}
							</div>
						</div>,
						document.body
					)
				: null}
		</div>
	);
};

export default DeveloperSelect;
