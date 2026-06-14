"use client";

import { useState, type FormEvent } from "react";
import NextLink from "next/link";
import clsx from "clsx";

import {
	Checkbox,
	FieldShell,
	SelectField,
	SubmitButton,
	TextField,
} from "./fields";
import {
	LockIcon,
	UserIcon,
	ShieldCheckIcon,
	KeyIcon,
	ArrowRightIcon,
} from "../icons";

const SECURITY_QUESTIONS = [
	{ value: "first_pet", label: "What was the name of your first pet?" },
	{ value: "birth_city", label: "What city were you born in?" },
	{ value: "maiden_name", label: "What is your mother's maiden name?" },
	{ value: "first_car", label: "What was the model of your first car?" },
	{ value: "favorite_book", label: "What is your favorite book?" },
	{ value: "elementary_school", label: "What elementary school did you attend?" },
];

interface FormState {
	username: string;
	password: string;
	confirm: string;
	question: string;
	answer: string;
	tos: boolean;
}

interface FormErrors {
	username?: string;
	password?: string;
	confirm?: string;
	question?: string;
	answer?: string;
	tos?: string;
}

function passwordIssues(pw: string): string[] {
	const issues: string[] = [];
	if (pw.length < 8) issues.push("at least 8 characters");
	if (!/[A-Za-z]/.test(pw)) issues.push("a letter");
	if (!/[0-9]/.test(pw)) issues.push("a number");
	return issues;
}

export function RegisterForm() {
	const [values, setValues] = useState<FormState>({
		username: "",
		password: "",
		confirm: "",
		question: "",
		answer: "",
		tos: false,
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [shake, setShake] = useState(false);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const setField =
		<K extends keyof FormState>(key: K) =>
		(e: { target: { value: string } }) =>
			setValues((v) => ({ ...v, [key]: e.target.value }));

	const validate = (): FormErrors => {
		const e: FormErrors = {};
		if (!values.username.trim()) e.username = "Username is required.";
		else if (values.username.trim().length < 3)
			e.username = "Username must be at least 3 characters.";
		else if (values.username.trim().length > 24)
			e.username = "Username must be 24 characters or fewer.";

		const issues = passwordIssues(values.password);
		if (issues.length) e.password = `Password needs ${issues.join(", ")}.`;
		if (!values.confirm) e.confirm = "Please confirm your password.";
		else if (values.confirm !== values.password)
			e.confirm = "Passwords don't match.";

		if (!values.question) e.question = "Pick a security question.";
		if (!values.answer.trim()) e.answer = "Answer can't be empty.";

		if (!values.tos) e.tos = "You need to accept the terms to continue.";
		return e;
	};

	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		const errs = validate();
		if (Object.keys(errs).length) {
			setErrors(errs);
			setShake(true);
			window.setTimeout(() => setShake(false), 450);
			return;
		}
		setErrors({});
		setLoading(true);
		window.setTimeout(() => {
			setLoading(false);
			setSuccess(true);
		}, 900);
	};

	return (
		<div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:py-20">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(52,211,153,0.06),transparent_55%)]"
			/>

			<form
				onSubmit={onSubmit}
				noValidate
				className={clsx(
					"auth-card-enter w-full max-w-[420px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/80 p-7 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8",
					shake && "auth-shake",
				)}
			>
				{/* heading */}
				<div
					className="auth-field flex flex-col gap-1.5"
					style={{ ["--auth-delay" as string]: "0ms" }}
				>
					<div className="flex items-center gap-2">
						<span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-[13px] font-bold text-white">
							c.
						</span>
						<span className="text-[11.5px] font-medium text-white/40">
							chattr.
						</span>
					</div>
					<h1 className="mt-3 text-[22px] font-semibold tracking-tight text-white">
						{success ? "You're in." : "Create your account"}
					</h1>
					<p className="text-[13px] leading-relaxed text-white/50">
						{success
							? "Your account is ready. You can sign in now."
							: "A username, a password, and one question only you'll know the answer to."}
					</p>
				</div>

				{success ? (
					<div
						className="auth-field mt-7 flex flex-col gap-3"
						style={{ ["--auth-delay" as string]: "60ms" }}
					>
						<div className="flex items-center gap-2.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3.5 py-3 text-[12.5px] text-emerald-200/90">
							<span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20 text-emerald-300">
								<svg
									viewBox="0 0 24 24"
									width={12}
									height={12}
									fill="none"
									stroke="currentColor"
									strokeWidth={3}
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="m5 12 5 5 9-12" className="check-draw" />
								</svg>
							</span>
							<span>Account created for {values.username}.</span>
						</div>
						<NextLink
							href="/signin"
							className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.02] text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
						>
							Go to sign in
							<ArrowRightIcon size={14} />
						</NextLink>
					</div>
				) : (
					<div className="mt-7 flex flex-col gap-4">
						<FieldShell
							label="Username"
							hint="3–24 characters. Letters, numbers, hyphens."
							error={errors.username}
							delay={60}
						>
							<TextField
								icon={<UserIcon size={15} />}
								type="text"
								name="username"
								autoComplete="username"
								placeholder="kira"
								value={values.username}
								onChange={setField("username")}
								aria-invalid={!!errors.username}
							/>
						</FieldShell>

						<FieldShell
							label="Password"
							hint="At least 8 characters, with a letter and a number."
							error={errors.password}
							delay={120}
						>
							<TextField
								icon={<LockIcon size={15} />}
								type="password"
								name="new-password"
								autoComplete="new-password"
								placeholder="••••••••"
								value={values.password}
								onChange={setField("password")}
								aria-invalid={!!errors.password}
							/>
						</FieldShell>

						<FieldShell
							label="Confirm password"
							error={errors.confirm}
							delay={180}
						>
							<TextField
								icon={<LockIcon size={15} />}
								type="password"
								name="confirm-password"
								autoComplete="new-password"
								placeholder="••••••••"
								value={values.confirm}
								onChange={setField("confirm")}
								aria-invalid={!!errors.confirm}
							/>
						</FieldShell>

						<div className="my-1 h-px bg-white/[0.06]" />

						<FieldShell
							label="Security question"
							hint="Used to recover your account if you lose your keys."
							error={errors.question}
							delay={240}
						>
							<SelectField
								icon={<ShieldCheckIcon size={15} />}
								name="security-question"
								options={SECURITY_QUESTIONS}
								placeholder="Pick one…"
								value={values.question}
								onChange={setField("question")}
								aria-invalid={!!errors.question}
							/>
						</FieldShell>

						<FieldShell
							label="Security answer"
							hint="Treat this like a password — no real names, no birth years."
							error={errors.answer}
							delay={300}
						>
							<TextField
								icon={<KeyIcon size={15} />}
								type="text"
								name="security-answer"
								autoComplete="off"
								placeholder="A phrase you'll remember"
								value={values.answer}
								onChange={setField("answer")}
								aria-invalid={!!errors.answer}
							/>
						</FieldShell>

						<div
							className="auth-field"
							style={{ ["--auth-delay" as string]: "360ms" }}
						>
							<Checkbox
								checked={values.tos}
								onChange={(v) => setValues((s) => ({ ...s, tos: v }))}
							>
								I agree to the{" "}
								<NextLink
									href="/terms"
									className="text-white/85 underline-offset-4 hover:underline"
								>
									Terms of Service
								</NextLink>{" "}
								and{" "}
								<NextLink
									href="/privacy"
									className="text-white/85 underline-offset-4 hover:underline"
								>
									Privacy Policy
								</NextLink>
								.
							</Checkbox>
							{errors.tos ? (
								<p
									role="alert"
									className="auth-shake mt-1.5 flex items-center gap-1.5 pl-7 text-[11.5px] text-rose-300/95"
								>
									{errors.tos}
								</p>
							) : null}
						</div>

						<div
							className="auth-field"
							style={{ ["--auth-delay" as string]: "420ms" }}
						>
							<SubmitButton loading={loading}>Create account</SubmitButton>
						</div>
					</div>
				)}

				<div
					className="auth-field mt-7 text-center text-[12.5px] text-white/45"
					style={{ ["--auth-delay" as string]: "480ms" }}
				>
					Already have an account?{" "}
					<NextLink
						href="/signin"
						className="font-medium text-white/85 underline-offset-4 transition-colors hover:text-emerald-300 hover:underline"
					>
						Sign in
					</NextLink>
				</div>
			</form>
		</div>
	);
}
