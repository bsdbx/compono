"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "@/components/account";

/** Sends an account that is already signed in to its projects. */
export function RedirectIfSignedIn() {
  const router = useRouter();
  const { data } = useAccount();

  useEffect(() => {
    if (data !== undefined) {
      router.replace("/");
    }
  }, [data, router]);

  return null;
}
