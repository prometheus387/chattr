import type { Metadata } from "next";
import { SignInForm } from "@/components/landing/auth/signin-form";

export const metadata: Metadata = {
	title: "Sign in",
	description: "Sign in to your chattr. account.",
};

export default function SignInPage() {
	return <SignInForm />;
}
