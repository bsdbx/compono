import { useQuery } from "@tanstack/react-query";
import { teamOptions } from "@/api/queries";
import { SignedIn } from "@/components/account";
import { AllProjects } from "@/components/projects/all-projects";
import { TeamSidebar } from "@/components/team-sidebar";
import { notFound, useParams } from "@/lib/navigation";

function TeamHomeContent() {
  const { team: url } = useParams<{ team: string }>();
  const { data: team, error } = useQuery({
    ...teamOptions({ path: { team_url: url } }),
    retry: false,
  });

  if (error !== null) {
    // Also a team the account isn't in, which the API won't tell apart
    notFound();
  }
  return (
    <div className="flex flex-1">
      {team ? <TeamSidebar team={team} /> : null}
      {team ? <AllProjects team={team} /> : null}
    </div>
  );
}

/** A team's page: its sidebar and its projects. */
export function TeamHome() {
  return (
    <SignedIn>
      <TeamHomeContent />
    </SignedIn>
  );
}
