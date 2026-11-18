import { Suspense } from "react";
import { SignedIn } from "@/components/account";
import { GeneralSettings } from "@/components/team-settings/general-settings";

export default function Page() {
  return (
    <Suspense>
      <SignedIn>
        <GeneralSettings />
      </SignedIn>
    </Suspense>
  );
}
