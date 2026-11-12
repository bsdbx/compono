"use client";

import Link from "next/link";
import { useAccount, useSignOut } from "@/components/account";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const { data: account } = useAccount();
  const signOut = useSignOut();
  return (
    <CenteredPage
      title="Something went wrong"
      description="We couldn’t load this page. Try again in a moment."
      footer={
        account ? (
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
        ) : null
      }
    >
      <Button size="lg" onClick={() => retry()}>
        Try again
      </Button>
      <Button size="lg" variant="secondary" asChild>
        <Link href="/">Back to projects</Link>
      </Button>
    </CenteredPage>
  );
}
