import type { Metadata } from "next";
import { Suspense } from "react";
import { SignedIn } from "@/components/account";
import { GeneralSettings } from "@/components/team-settings/general-settings";

export const metadata: Metadata = { title: "Team settings · Compono" };

export default function Page() {
  return (
    <Suspense>
      <SignedIn>
        <GeneralSettings />
      </SignedIn>
    </Suspense>
  );
}
