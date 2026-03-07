const GenderCheckbox = ({ onCheckboxChange, selectedGender, error }) => {
	return (
		<div className='space-y-3'>
			<p className='auth-label'>Gender</p>
			<div className={`grid grid-cols-2 gap-3 ${error ? "auth-gender-error" : ""}`}>
				<button
					type='button'
					className={`auth-gender-pill ${selectedGender === "male" ? "auth-gender-pill--active" : ""}`}
					onClick={() => onCheckboxChange("male")}
				>
					<span className='text-base'>Male</span>
					<span className='text-xs text-slate-400'>Default avatar: blue</span>
				</button>
				<button
					type='button'
					className={`auth-gender-pill ${selectedGender === "female" ? "auth-gender-pill--active" : ""}`}
					onClick={() => onCheckboxChange("female")}
				>
					<span className='text-base'>Female</span>
					<span className='text-xs text-slate-400'>Default avatar: pink</span>
				</button>
			</div>
			{error ? <p className='auth-error-text'>{error}</p> : null}
		</div>
	);
};
export default GenderCheckbox;

// STARTER CODE FOR THIS FILE
// const GenderCheckbox = () => {
// 	return (
// 		<div className='flex'>
// 			<div className='form-control'>
// 				<label className={`label gap-2 cursor-pointer`}>
// 					<span className='label-text'>Male</span>
// 					<input type='checkbox' className='checkbox border-slate-900' />
// 				</label>
// 			</div>
// 			<div className='form-control'>
// 				<label className={`label gap-2 cursor-pointer`}>
// 					<span className='label-text'>Female</span>
// 					<input type='checkbox' className='checkbox border-slate-900' />
// 				</label>
// 			</div>
// 		</div>
// 	);
// };
// export default GenderCheckbox;
