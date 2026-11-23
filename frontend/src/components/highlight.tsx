import { Fragment } from "react";
import { textMatches } from "@/lib/text-matches";

/** Marks the matching parts of a name using the shared search highlight. */
export function Highlight({
  text,
  query,
  all = false,
  activeStart,
}: {
  text: string;
  query: string;
  all?: boolean;
  activeStart?: number | undefined;
}) {
  const matches = textMatches(text, query);
  const shown = all ? matches : matches.slice(0, 1);
  if (!shown.length) return text;
  return (
    <>
      {shown.map(({ start, end }, index) => (
        <Fragment key={start}>
          {text.slice(shown[index - 1]?.end ?? 0, start)}
          <mark
            data-active-match={start === activeStart ? "true" : undefined}
            className={
              start === activeStart
                ? "rounded-xs bg-primary/55 text-inherit"
                : "rounded-xs bg-primary/30 text-inherit"
            }
          >
            {text.slice(start, end)}
          </mark>
        </Fragment>
      ))}
      {text.slice(shown.at(-1)?.end)}
    </>
  );
}
