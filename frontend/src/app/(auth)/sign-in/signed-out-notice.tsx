"use client";

import { Info } from "lucide-react";
import { useSearchParams } from "next/navigation";

const MESSAGES: Record<string, string> = {
  signed_out: "You were signed out from another device.",
  expired: "Your session expired. Sign in again.",
};

/** Says why this browser was signed out, when it didn't sign out itself. */
export function SignedOutNotice() {
  const reason = useSearchParams().get("reason");
  const message = reason === null ? undefined : MESSAGES[reason];
  if (message === undefined) {
    return null;
  }
  return (
    <p
      role="status"
      className="mt-6 flex items-center gap-2.5 rounded-lg border border-input px-3.5 py-3 text-base"
    >
      <Info className="size-4 shrink-0 text-muted-foreground" />
      {message}
    </p>
  );
}
