"use client";

import { useAccount, useSignOut } from "@/components/account";

/** "Signed in as mira@acme.dev · Sign out", once the account is known. */
export function SignedInFooter() {
  const { data: account } = useAccount();
  const signOut = useSignOut();
  if (account === undefined) {
    return null;
  }
  return (
    <>
      Signed in as {account.email} ·{" "}
      <button
        type="button"
        onClick={signOut}
        className="text-muted-foreground hover:text-foreground"
      >
        Sign out
      </button>
    </>
  );
}
