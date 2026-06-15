"use client";

import {
	forwardRef,
	useId,
	useState,
	type InputHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
} from "react";
import clsx from "clsx";

import {
	AlertIcon,
	CheckIcon,
	ChevronDownIcon,
	EyeIcon,
	EyeOffIcon,
} from "../icons";

/* -------------------------------------------------------------------------- */
/*  Form primitives — used by /signin and /register                          */
/* -------------------------------------------------------------------------- */

interface FieldShellProps {
	label: string;
	hint?: string;
	error?: string;
	delay?: number;
	children: ReactNode;
	/** Marks a field as optional (renders a small "optional" tag next to the label). */
	optional?: boolean;
}

/**
 * Layout wrapper that handles the label / hint / error area and applies
 * the staggered entrance animation. Children render the actual input.
 */
export function FieldShell({
	label,
	hint,
	error,
	delay = 0,
	children,
	optional,
}: FieldShellProps) {
	return (
		<div
			className="auth-field flex flex-col gap-1.5"
			style={{ ["--auth-delay" as string]: `${delay}ms` }}
		>
			<div className="flex items-center justify-between">
				<label className="text-[12.5px] font-medium text-white/75">{label}</label>
				{optional ? (
					<span className="text-[10.5px] uppercase tracking-wider text-white/30">
						Optional
					</span>
				) : null}
			</div>
			{children}
			{hint && !error ? (
				<p className="text-[11.5px] text-white/40">{hint}</p>
			) : null}
			{error ? (
				<p
					role="alert"
					className="auth-shake flex items-center gap-1.5 text-[11.5px] text-rose-300/95"
				>
					<AlertIcon size={12} className="shrink-0" />
					<span>{error}</span>
				</p>
			) : null}
		</div>
	);
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
	icon?: ReactNode;
	trailing?: ReactNode;
	/** Show a built-in show/hide password toggle (auto-enabled for type="password"). */
	passwordToggle?: boolean;
}

/**
 * Auth-styled text input. `icon` renders on the left, `trailing` on the right
 * (e.g., a character count). For `type="password"`, a built-in eye toggle
 * is added unless you opt out with `passwordToggle={false}`.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
	function TextField({ icon, trailing, className, type, passwordToggle, ...rest }, ref) {
		const isPassword = type === "password" && passwordToggle !== false;
		const [shown, setShown] = useState(false);
		const effectiveType = isPassword ? (shown ? "text" : "password") : type;
		const reactId = useId();
		return (
			<div className="relative">
				{icon ? (
					<span className="auth-input-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors">
						{icon}
					</span>
				) : null}
				<input
					ref={ref}
					id={rest.id ?? reactId}
					type={effectiveType}
					className={clsx(
						"auth-input w-full rounded-lg border border-white/[0.08] bg-white/[0.02] py-2.5 text-[13.5px] text-white placeholder-white/30 outline-none",
						icon ? "pl-9" : "pl-3.5",
						isPassword || trailing ? "pr-10" : "pr-3.5",
						"disabled:opacity-50",
						className,
					)}
					{...rest}
				/>
				{isPassword ? (
					<button
						type="button"
						aria-label={shown ? "Hide password" : "Show password"}
						onClick={() => setShown((v) => !v)}
						className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/80"
					>
						{shown ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
					</button>
				) : trailing ? (
					<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
						{trailing}
					</span>
				) : null}
			</div>
		);
	},
);

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
	icon?: ReactNode;
	options: { value: string; label: string }[];
	placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
	function SelectField({ icon, options, placeholder, className, ...rest }, ref) {
		const reactId = useId();
		return (
			<div className="relative">
				{icon ? (
					<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
						{icon}
					</span>
				) : null}
				<select
					ref={ref}
					id={rest.id ?? reactId}
					className={clsx(
						"auth-input w-full appearance-none rounded-lg border border-white/[0.08] bg-white/[0.02] py-2.5 text-[13.5px] text-white outline-none",
						icon ? "pl-9" : "pl-3.5",
						"pr-10",
						// Hide the default option text color in dark mode by
						// relying on `color-scheme`.
						"[color-scheme:dark]",
						className,
					)}
					{...rest}
				>
					{placeholder ? (
						<option value="" disabled>
							{placeholder}
						</option>
					) : null}
					{options.map((opt) => (
						<option key={opt.value} value={opt.value} className="bg-[#0c0d11]">
							{opt.label}
						</option>
					))}
				</select>
				<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
					<ChevronDownIcon size={14} />
				</span>
			</div>
		);
	},
);

interface CheckboxProps {
	checked: boolean;
	onChange: (next: boolean) => void;
	children: ReactNode;
	id?: string;
	delay?: number;
	disabled?: boolean;
}

/**
 * Custom checkbox with a path-drawing check animation (see `.check-draw`
 * in globals.css) and a small scale pop when toggled on.
 */
export function Checkbox({ checked, onChange, children, id, delay = 0, disabled = false }: CheckboxProps) {
	const reactId = useId();
	return (
		<label
			htmlFor={id ?? reactId}
			className={clsx(
				"auth-field group flex cursor-pointer select-none items-start gap-2.5",
				disabled && "opacity-50 cursor-not-allowed",
			)}
			style={{ ["--auth-delay" as string]: `${delay}ms` }}
		>
			<span className="relative mt-0.5 inline-flex shrink-0">
				<input
					id={id ?? reactId}
					type="checkbox"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
					disabled={disabled}
					className="peer sr-only"
				/>
				<span
					aria-hidden
					className={clsx(
						"grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-all duration-200",
						checked
							? "border-emerald-400/70 bg-emerald-400 text-[#0b0c0f] scale-100"
							: "border-white/15 bg-white/[0.02] text-transparent scale-95 group-hover:border-white/30",
					)}
				>
					<CheckIcon size={12} className="text-[#0b0c0f]" />
				</span>
			</span>
			<span className="text-[12.5px] leading-relaxed text-white/65">
				{children}
			</span>
		</label>
	);
}

interface SubmitButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	loading?: boolean;
	children: ReactNode;
}

export function SubmitButton({
	loading,
	children,
	className,
	disabled,
	...rest
}: SubmitButtonProps) {
	return (
		<button
			type="submit"
			disabled={disabled || loading}
			className={clsx(
				"group relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg text-[13.5px] font-medium transition-all duration-200",
				"bg-white text-[#0b0c0f] hover:bg-white/90 active:bg-white/85",
				"disabled:opacity-60 disabled:cursor-not-allowed",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0b0f]",
				className,
			)}
			{...rest}
		>
			<span
				className={clsx(
					"flex items-center gap-2 transition-opacity",
					loading && "opacity-0",
				)}
			>
				{children}
			</span>
			{loading ? (
				<span className="absolute inset-0 grid place-items-center">
					<span
						aria-hidden
						className="auth-spinner h-4 w-4 rounded-full border-2 border-[#0b0c0f]/30 border-t-[#0b0c0f]"
					/>
				</span>
			) : null}
			{/* hover sheen */}
			<span
				aria-hidden
				className="pointer-events-none absolute inset-y-0 -left-[120%] w-[60%] bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-[260%]"
			/>
		</button>
	);
}
