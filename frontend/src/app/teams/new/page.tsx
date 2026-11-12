import type { Metadata } from "next";
import { SignedIn } from "@/components/account";
import { FirstRun } from "./first-run";

export const metadata: Metadata = { title: "Set up your team · Compono" };

export default function NewTeamPage() {
  return (
    <SignedIn>
      <FirstRun />
    </SignedIn>
  );
}
