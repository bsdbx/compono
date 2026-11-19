/** Marks the matching part of a name using the shared search highlight. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const at =
    query === "" ? -1 : text.toLowerCase().indexOf(query.toLowerCase());
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-xs bg-primary/30 text-inherit">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}
