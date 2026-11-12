"use client";

import { CircleAlert, CloudCheck, LoaderCircle, Workflow } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { Draft } from "@/components/editor/draft";
import { VERSION } from "@/lib/version";

/** The bar at the bottom of the editor: how many nodes, whether the work is saved, and Compono's version. */
export function StatusBar({ draft }: { draft: Draft }) {
  const { status, content } = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  const nodes = content?.graph.nodes;
  const count = Array.isArray(nodes) ? nodes.length : 0;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4.5 border-border border-t bg-sidebar px-3 text-2xs text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0">
      <span className="flex items-center gap-1.5">
        <Workflow />
        {count} {count === 1 ? "node" : "nodes"}
      </span>
      <span role="status" className="flex items-center gap-1.5">
        {status === "saved" ? (
          <>
            <CloudCheck />
            Saved
          </>
        ) : null}
        {status === "saving" ? (
          <>
            <LoaderCircle className="animate-spin" />
            Saving…
          </>
        ) : null}
        {status === "failed" ? (
          <>
            <CircleAlert className="text-error" />
            <span className="text-error">Couldn’t save</span>
            <button
              type="button"
              onClick={() => draft.retry()}
              className="ml-1 text-error underline underline-offset-2"
            >
              Retry
            </button>
          </>
        ) : null}
        {status === "conflict" ? (
          <>
            <CircleAlert className="text-error" />
            <span className="text-error">
              Someone else saved this component
            </span>
            <button
              type="button"
              onClick={() => void draft.reload()}
              className="ml-1 text-error underline underline-offset-2"
            >
              Reload
            </button>
          </>
        ) : null}
      </span>
      <span className="ml-auto text-xs">v{VERSION}</span>
    </footer>
  );
}
