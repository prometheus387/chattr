import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Standard centered container for marketing/auth pages. Matches the
 * previous root-layout default (`container mx-auto max-w-7xl px-6`) so
 * the visual look of those pages is unchanged after the refactor.
 *
 * The `/client` page deliberately does NOT use this — it renders its
 * own full-bleed layout.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("container mx-auto max-w-7xl px-6", className)}>
      {children}
    </div>
  );
}
