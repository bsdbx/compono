import { SignedIn } from "@/components/account";
import { FirstRun } from "./first-run";

export default function NewTeamPage() {
  return (
    <SignedIn>
      <FirstRun />
    </SignedIn>
  );
}
