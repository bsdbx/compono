import { Check, Copy } from "lucide-react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Clipboard feedback crossfades in both directions, without changing the button's width. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "onClick"> & {
  text: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      {...props}
      aria-label={copied ? copiedLabel : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-hidden className="inline-grid">
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            copied ? "scale-95 opacity-0" : "scale-100 opacity-100",
          )}
        >
          <Copy />
          {label}
        </span>
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            copied ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <Check />
          {copiedLabel}
        </span>
      </span>
    </Button>
  );
}
