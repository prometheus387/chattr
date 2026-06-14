"use client";

import { useState, type FormEvent } from "react";
import NextLink from "next/link";
import clsx from "clsx";

import {
	Checkbox,
	FieldShell,
	SubmitButton,
	TextField,
} from "./fields";
import { LockIcon, UserIcon, ArrowRightIcon } from "../icons";

interface FormState {
	username: string;
	password: string;
	remember: boolean;
}

interface FormErrors {
	username?: string;
	password?: string;
	form?: string;
}

export function SignInForm() {
	const [values, setValues] = useState<FormState>({
		username: "",
		password: "",
		remember: false,
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [shake, setShake] = useState(false);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const update =
		<K extends keyof FormState>(key: K) =>
		(e: { target: { value: string } }) =>
			setValues((v) => ({ ...v, [key]: e.target.value }));

	const validate = (): FormErrors => {
		const e: FormErrors = {};
		if (!values.username.trim()) e.username = "Username is required.";
		else if (values.username.trim().length < 3)
			e.username = "Username must be at least 3 characters.";
		if (!values.password) e.password = "Password is required.";
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

		// Simulate a network round-trip. No backend in this demo.
		window.setTimeout(() => {
			setLoading(false);
			setSuccess(true);
		}, 900);
	};

	return (
		<div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:py-20">
			{/* faint radial behind the card */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(52,211,153,0.06),transparent_55%)]"
			/>

			<form
				onSubmit={onSubmit}
				noValidate
				className={clsx(
					"auth-card-enter w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-[#0c0d11]/80 p-7 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8",
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
						{success ? "Welcome back." : "Sign in to your account"}
					</h1>
					<p className="text-[13px] leading-relaxed text-white/50">
						{success
							? values.remember
								? "You'll stay signed in for 30 days on this device."
								: "Redirecting you to the client…"
							: "Enter your credentials to continue."}
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
							<span>Signed in as {values.username}.</span>
						</div>
						<NextLink
							href="/client"
							className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.02] text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
						>
							Continue to the client
							<ArrowRightIcon size={14} />
						</NextLink>
					</div>
				) : (
					<div className="mt-7 flex flex-col gap-4">
						<FieldShell label="Username" error={errors.username} delay={60}>
							<TextField
								icon={<UserIcon size={15} />}
								type="text"
								name="username"
								autoComplete="username"
								placeholder="kira"
								value={values.username}
								onChange={update("username")}
								aria-invalid={!!errors.username}
							/>
						</FieldShell>

						<FieldShell label="Password" error={errors.password} delay={130}>
							<TextField
								icon={<LockIcon size={15} />}
								type="password"
								name="password"
								autoComplete="current-password"
								placeholder="••••••••"
								value={values.password}
								onChange={update("password")}
								aria-invalid={!!errors.password}
							/>
						</FieldShell>

						<div style={{ ["--auth-delay" as string]: "200ms" }} className="auth-field">
							<Checkbox
								checked={values.remember}
								onChange={(v) => setValues((s) => ({ ...s, remember: v }))}
								delay={0}
							>
								Keep me signed in for{" "}
								<span className="text-white/85">30 days</span> on this device.
							</Checkbox>
						</div>

						<div
							className="auth-field"
							style={{ ["--auth-delay" as string]: "260ms" }}
						>
							<SubmitButton loading={loading}>Sign in</SubmitButton>
						</div>
					</div>
				)}

				<div
					className="auth-field mt-7 text-center text-[12.5px] text-white/45"
					style={{ ["--auth-delay" as string]: "320ms" }}
				>
					Don&apos;t have an account?{" "}
					<NextLink
						href="/register"
						className="font-medium text-white/85 underline-offset-4 transition-colors hover:text-emerald-300 hover:underline"
					>
						Create one
					</NextLink>
				</div>
			</form>
		</div>
	);
}
