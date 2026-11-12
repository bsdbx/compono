import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedIn } from "@/components/account";
import { MembersSettings } from "@/components/team-settings/members-settings";

export const metadata: Metadata = { title: "Members · Compono" };

export default function Page() {
  return (
    <Suspense>
      <SignedIn>
        <MembersSettings />
      </SignedIn>
    </Suspense>
  );
}
