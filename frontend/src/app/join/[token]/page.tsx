import { Suspense } from "react";
import { JoinInvite } from "./join-invite";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinInvite />
    </Suspense>
  );
}
