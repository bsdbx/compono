"use client";

import Link from "next/link";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <CenteredPage
      title="Something went wrong"
      description="We couldn’t load this page. Try again in a moment."
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
