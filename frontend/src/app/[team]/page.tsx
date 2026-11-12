import { Suspense } from "react";
import { TeamHome } from "./team-home";

export default function TeamPage() {
  return (
    <Suspense>
      <TeamHome />
    </Suspense>
  );
}
