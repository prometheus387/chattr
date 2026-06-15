import type { Metadata } from "next";
import { SignInForm } from "@/components/landing/auth/signin-form";
import { PageContainer } from "@/components/landing/page-container";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your chattr. account.",
};

export default function SignInPage() {
  return (
    <PageContainer>
      <SignInForm />
    </PageContainer>
  );
}
