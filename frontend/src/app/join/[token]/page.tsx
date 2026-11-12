import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinInvite } from "./join-invite";

export const metadata: Metadata = { title: "Join a team · Compono" };

export default function JoinPage() {
  return (
    <Suspense>
      <JoinInvite />
    </Suspense>
  );
}
