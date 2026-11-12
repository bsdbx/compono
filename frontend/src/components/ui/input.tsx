import { cn } from "cn";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-field px-3 text-base text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error-border",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
