"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A team URL field, with the app's address before it, like compono.app/acme. */
export function TeamUrlInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <div
      className={cn(
        "flex h-9 w-full overflow-hidden rounded-md border border-input bg-field text-base has-aria-invalid:border-error-border",
        className,
      )}
    >
      <span className="flex items-center border-input border-r px-3 text-muted-foreground">
        {window.location.host}/
      </span>
      <input
        {...props}
        autoCapitalize="none"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent px-3 text-foreground outline-none"
      />
    </div>
  );
}
