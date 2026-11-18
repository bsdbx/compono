import { useMemo } from "react";
import { parse, type TokenType } from "sugar-high/core";
import { tokenize } from "sugar-high/lang/javascript";

const COLORS: Partial<Record<TokenType, string>> = {
  keyword: "text-[#c4b5fd]",
  string: "text-[#86efac]",
  class: "text-[#7dd3fc]",
  property: "text-[#f6ad74]",
  entity: "text-[#8b8ef4]",
  sign: "text-muted-foreground",
  comment: "text-subtle-foreground italic",
};

/** Tokenize the complete JSX file so comments and strings can span lines. */
export function HighlightedCode({ code }: { code: string }) {
  const { lines } = useMemo(
    () =>
      parse(code.replace(/\n$/, ""), {
        tokenize: (source) => tokenize(source, undefined),
      }),
    [code],
  );
  return (
    <pre className="min-h-0 flex-1 overflow-auto py-3 font-mono text-xs leading-5">
      <code>
        {lines.map((line) => (
          <span key={line.index} className="flex">
            <span
              aria-hidden
              className="w-12 shrink-0 select-none pr-4 text-right text-subtle-foreground"
            >
              {line.index + 1}
            </span>
            <span className="whitespace-pre pr-4">
              {line.tokens.length === 0
                ? " "
                : line.tokens.map((token, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positions in the current source line
                    <span key={index} className={COLORS[token.type]}>
                      {token.value}
                    </span>
                  ))}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
