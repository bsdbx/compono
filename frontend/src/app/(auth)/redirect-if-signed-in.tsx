"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "@/components/account";
import { safeNext } from "@/lib/team-url";

/** Sends an account that is already signed in where it was going, or to its projects. */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { data } = useAccount();

  useEffect(() => {
    if (data !== undefined) {
      router.replace(safeNext(next));
    }
  }, [data, next, router]);

  return null;
}
