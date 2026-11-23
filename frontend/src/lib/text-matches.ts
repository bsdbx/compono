/** Literal, case-insensitive matches, with offsets into the original text. */
export function textMatches(text: string, query: string) {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(text.matchAll(new RegExp(escaped, "giu")), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
