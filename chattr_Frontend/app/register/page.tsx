import type { Metadata } from "next";
import { RegisterForm } from "@/components/landing/auth/register-form";
import { PageContainer } from "@/components/landing/page-container";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your chattr. account.",
};

export default function RegisterPage() {
  return (
    <PageContainer>
      <RegisterForm />
    </PageContainer>
  );
}
