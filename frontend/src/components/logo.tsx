import Link from "next/link";
import { useId } from "react";

/** The Compono mark: three stacked layers. */
export function LogoMark({ size = 24 }: { size?: number }) {
  // Unique, as the hidden small-screen page has a logo too
  const gradient = useId();
  const paint = `url(#${gradient})`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient
          id={gradient}
          gradientUnits="userSpaceOnUse"
          x1="3"
          y1="3"
          x2="21"
          y2="21"
        >
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#b9beff" />
        </linearGradient>
      </defs>
      <polygon
        points="12,3 21,8 12,13 3,8"
        fill={paint}
        stroke={paint}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polyline
        points="3,12.5 12,17.5 21,12.5"
        stroke={paint}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <polyline
        points="3,16.5 12,21.5 21,16.5"
        stroke={paint}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.28"
      />
    </svg>
  );
}

/** The Compono mark and name, linking to the start page. */
export function Logo() {
  return (
    <Link
      href="/"
      aria-label="Compono home"
      className="flex items-center gap-2"
    >
      <LogoMark />
      <span className="font-semibold text-[17px] text-foreground leading-none tracking-tight">
        Compono
      </span>
    </Link>
  );
}
