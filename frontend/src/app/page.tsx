import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { myTeamsOptions } from "@/api/queries";
import { SignedIn } from "@/components/account";
import { useRouter } from "@/lib/navigation";

/** Opens the account's first team, or sets one up when it has none. */
function OpenTeam() {
  const router = useRouter();
  const { data: teams, error } = useQuery(myTeamsOptions());

  useEffect(() => {
    if (teams !== undefined) {
      const [first] = teams;
      router.replace(first === undefined ? "/teams/new" : `/${first.url}`);
    }
  }, [teams, router]);

  if (error !== null) {
    throw error;
  }
  return null;
}

export default function Home() {
  return (
    <SignedIn>
      <OpenTeam />
    </SignedIn>
  );
}
