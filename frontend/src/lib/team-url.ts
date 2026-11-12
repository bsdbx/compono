/** A team URL: 3 to 39 lowercase letters and digits, with single hyphens between them, as the API checks. */
export const TEAM_URL_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TEAM_URL_MAX_LENGTH = 39;

/** A team URL made from a team name: Acme Design becomes acme-design. */
export function suggestUrl(name: string): string {
  return (
    name
      // Café becomes cafe: split letters from their accents, then drop the accents
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, TEAM_URL_MAX_LENGTH)
      .replace(/-+$/, "")
  );
}

/** The token of an invite link, pasted whole or as just the token. */
export function inviteToken(link: string): string {
  const trimmed = link.trim();
  const match = /\/join\/([^/?#\s]+)/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

/** Where to go after signing in: a page of this app, never another site. */
export function safeNext(next: string | null): string {
  return next?.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
    ? next
    : "/";
}
