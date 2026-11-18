import { CircleAlert } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import type { Draft, SaveStatus } from "@/components/editor/draft";
import { Button } from "@/components/ui/button";

const ICONS: Record<SaveStatus, string> = {
  saved: "/favicon-saved.svg",
  saving: "/favicon-pending.svg",
  failed: "/favicon-failed.svg",
  conflict: "/favicon-failed.svg",
};

/** Save feedback in the browser tab, with recovery actions when saving needs help. */
export function SaveIndicator({ draft }: { draft: Draft }) {
  const { status, content } = useSyncExternalStore(
    draft.subscribe,
    draft.getSnapshot,
    draft.getSnapshot,
  );
  const state = content === undefined ? undefined : status;

  useEffect(() => {
    if (state === undefined) return;
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (icon === null) return;
    const original = ["href", "type", "sizes"].map(
      (attribute) => [attribute, icon.getAttribute(attribute)] as const,
    );
    icon.setAttribute("href", ICONS[state]);
    icon.setAttribute("type", "image/svg+xml");
    icon.setAttribute("sizes", "any");
    return () => {
      for (const [attribute, value] of original) {
        if (value === null) icon.removeAttribute(attribute);
        else icon.setAttribute(attribute, value);
      }
    };
  }, [state]);

  if (state === undefined) return null;
  const failed = state === "failed";
  const conflict = state === "conflict";

  return (
    <>
      <span role="status" className="sr-only">
        {state === "saved" ? "Saved" : state === "saving" ? "Saving…" : ""}
      </span>
      {failed || conflict ? (
        <div
          role="alert"
          className="fixed top-14 right-6 z-50 flex max-w-[calc(100%-3rem)] items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-base shadow-2xl"
        >
          <CircleAlert className="size-4 shrink-0 text-error" />
          <p>
            {failed ? "Couldn’t save" : "Someone else saved this component"}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (failed) draft.retry();
              else void draft.reload().catch(() => {});
            }}
          >
            {failed ? "Retry" : "Reload"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
