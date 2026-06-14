import type { Metadata } from "next";
import { RegisterForm } from "@/components/landing/auth/register-form";

export const metadata: Metadata = {
	title: "Create account",
	description: "Create your chattr. account.",
};

export default function RegisterPage() {
	return <RegisterForm />;
}
