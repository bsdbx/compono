"use client";

import { Check, Copy, Download } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useGeneratedCode } from "@/components/editor/canvas/data";
import { readGraph } from "@/components/editor/canvas/graph";
import type { Draft } from "@/components/editor/draft";
import { Button } from "@/components/ui/button";

/** The open component as code: the JSX file it becomes, to copy or download. */
export function CodeView({ draft, name }: { draft: Draft; name: string }) {
  const { content } = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  const graph = useMemo(
    () => (content ? readGraph(content.graph) : undefined),
    [content],
  );
  const generated = useGeneratedCode(graph, name);
  const [copied, setCopied] = useState(false);

  if (generated === undefined) {
    return null;
  }

  const { filename, code, errors } = generated;
  if (code === null || code === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="font-medium text-error text-sm">
          Can’t write the code yet
        </p>
        {errors.map((error) => (
          <p key={error} className="text-muted-foreground text-xs">
            {error}
          </p>
        ))}
      </div>
    );
  }

  function download(text: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/javascript" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <section
      aria-label="Code"
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-border border-b pr-1.5 pl-3.5">
        <h2 className="flex-1 truncate font-mono text-xs">{filename}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => download(code)}>
          <Download />
          Download
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto py-3 font-mono text-xs leading-5">
        <code>
          {lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line is where it is in the file
            <span key={index} className="flex">
              <span
                aria-hidden
                className="w-12 shrink-0 select-none pr-4 text-right text-subtle-foreground"
              >
                {index + 1}
              </span>
              <span className="whitespace-pre pr-4">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </section>
  );
}
