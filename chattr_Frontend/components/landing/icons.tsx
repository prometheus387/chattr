import * as React from "react";
import type { IconSvgProps } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Feature icons — used in the landing page features grid                   */
/* -------------------------------------------------------------------------- */

const baseProps = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

export const LockIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<rect x="4" y="11" width="16" height="10" rx="2" />
		<path d="M8 11V8a4 4 0 1 1 8 0v3" />
		<circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
	</svg>
);

export const KeyIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<circle cx="8" cy="15" r="4" />
		<path d="M10.8 12.2 21 2" />
		<path d="m17 6 2 2" />
		<path d="m14 9 2 2" />
	</svg>
);

export const UsersIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
		<path d="M16 3.13a4 4 0 0 1 0 7.75" />
	</svg>
);

export const HashIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M4 9h16" />
		<path d="M4 15h16" />
		<path d="M10 3 8 21" />
		<path d="M16 3l-2 18" />
	</svg>
);

export const TerminalIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<rect x="3" y="4" width="18" height="16" rx="2" />
		<path d="m7 9 3 3-3 3" />
		<path d="M13 15h4" />
	</svg>
);

export const ServerIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<rect x="3" y="3" width="18" height="7" rx="1.5" />
		<rect x="3" y="14" width="18" height="7" rx="1.5" />
		<path d="M7 6.5h.01" />
		<path d="M7 17.5h.01" />
		<path d="M11 6.5h6" />
		<path d="M11 17.5h6" />
	</svg>
);

export const ArrowRightIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M5 12h14" />
		<path d="m13 5 7 7-7 7" />
	</svg>
);

export const PlusIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M12 5v14" />
		<path d="M5 12h14" />
	</svg>
);

export const PaperclipIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.98 8.83l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
	</svg>
);

export const ShieldCheckIcon: React.FC<IconSvgProps> = ({ size = 22, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
		<path d="m9 12 2 2 4-4" />
	</svg>
);

export const UserIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
		<circle cx="12" cy="7" r="4" />
	</svg>
);

export const EyeIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
		<circle cx="12" cy="12" r="3" />
	</svg>
);

export const EyeOffIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
		<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
		<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
		<line x1="2" y1="2" x2="22" y2="22" />
	</svg>
);

export const CheckIcon: React.FC<IconSvgProps> = ({ size = 12, ...props }) => (
	<svg
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		strokeWidth={3}
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<path d="m5 12 5 5 9-12" className="check-draw" />
	</svg>
);

export const ChevronDownIcon: React.FC<IconSvgProps> = ({ size = 16, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<path d="m6 9 6 6 6-6" />
	</svg>
);

export const AlertIcon: React.FC<IconSvgProps> = ({ size = 14, ...props }) => (
	<svg viewBox="0 0 24 24" width={size} height={size} {...baseProps} {...props}>
		<circle cx="12" cy="12" r="10" />
		<line x1="12" y1="8" x2="12" y2="12" />
		<line x1="12" y1="16" x2="12.01" y2="16" />
	</svg>
);
