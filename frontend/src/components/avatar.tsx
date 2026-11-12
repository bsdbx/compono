import { cn } from "@/lib/utils";

const COLORS = [
  "bg-avatar-indigo",
  "bg-avatar-green",
  "bg-avatar-orange",
  "bg-avatar-purple",
  "bg-avatar-blue",
  "bg-avatar-gray",
] as const;

/** The first letters of the first two words, like MK for Mira Kovalenko. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** The same color for an account every time, picked from its id. */
export function avatarColor(id: string): (typeof COLORS)[number] {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1_000_003;
  }
  return COLORS[hash % COLORS.length] ?? COLORS[0];
}

/** An account's initials in a circle of its color. */
export function Avatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-2xs text-white",
        avatarColor(id),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
