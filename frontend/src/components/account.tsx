"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, use, useEffect } from "react";
import {
  currentAccountOptions,
  signOutMutation,
} from "@/api/@tanstack/react-query.gen";
import type { Account, Reason } from "@/api/types.gen";

const REASONS: readonly string[] = [
  "no_session",
  "signed_out",
  "expired",
] satisfies Reason[];

/** Why the API signed nobody in, or undefined for any other error. */
export function notSignedIn(error: unknown): Reason | undefined {
  if (typeof error === "object" && error !== null && "detail" in error) {
    const { detail } = error;
    if (typeof detail === "string" && REASONS.includes(detail)) {
      return detail as Reason;
    }
  }
  return undefined;
}

/** Where to sign in, saying why when this browser was signed out. */
export function signInUrl(reason: Reason): string {
  return reason === "no_session" ? "/sign-in" : `/sign-in?reason=${reason}`;
}

/** The signed-in account. Not signed in is an answer, not something to retry. */
export function useAccount() {
  return useQuery({ ...currentAccountOptions(), retry: false });
}

const SignedInAccount = createContext<Account | null>(null);

/** The account that SignedIn checked. */
export function useSignedInAccount(): Account {
  const account = use(SignedInAccount);
  if (account === null) {
    throw new Error("useSignedInAccount needs a SignedIn around it.");
  }
  return account;
}

/** Shows its children to a signed-in account, and sends everyone else to sign in. */
export function SignedIn({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, error } = useAccount();
  const reason = error === null ? undefined : notSignedIn(error);

  useEffect(() => {
    if (reason !== undefined) {
      router.replace(signInUrl(reason));
    }
  }, [reason, router]);

  // Any other error is the error page's
  if (error !== null && reason === undefined) {
    throw error;
  }
  if (data === undefined) {
    return null;
  }
  return <SignedInAccount value={data}>{children}</SignedInAccount>;
}

/** Signs this browser out, forgets what it loaded, and goes to sign in. */
export function useSignOut(): () => void {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { mutate } = useMutation({
    ...signOutMutation(),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/sign-in");
    },
  });
  return () => mutate({});
}
