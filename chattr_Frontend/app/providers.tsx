"use client";

import type { ThemeProviderProps } from "next-themes";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { AuthProvider } from "@/contexts/auth-provider";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

export function Providers({ children, themeProps }: ProvidersProps) {
  return <>
    <AuthProvider>
      <NextThemesProvider {...themeProps}>
        {children}
      </NextThemesProvider>;
    </AuthProvider>
  </>
}
