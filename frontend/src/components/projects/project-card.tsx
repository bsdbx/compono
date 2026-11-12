import Link from "next/link";
import type { ReactNode } from "react";
import type { ListedProject } from "@/api/types.gen";
import { Avatar } from "@/components/avatar";
import { editedAgo } from "@/lib/edited-ago";

/** Up to three members, or two and how many more. */
function Members({ members }: { members: ListedProject["members"] }) {
  const shown = members.length > 3 ? members.slice(0, 2) : members;
  const more = members.length - shown.length;
  return (
    <span className="flex -space-x-0.5">
      {shown.map((member) => (
        <Avatar
          key={member.id}
          id={member.id}
          name={member.name}
          className="size-5 text-[8.5px] ring-2 ring-background"
        />
      ))}
      {more > 0 ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted font-semibold text-[8.5px] text-muted-foreground ring-2 ring-background">
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/** A project in the grid: a cover, its name and role, when it was edited, and who is in it. */
export function ProjectCard({
  teamUrl,
  project,
  now,
  actions,
}: {
  teamUrl: string;
  project: ListedProject;
  now: Date;
  /** Shown over the cover when the card is hovered, like the settings button */
  actions?: ReactNode;
}) {
  return (
    <article className="group relative">
      <Link href={`/${teamUrl}/${project.url}`} className="block">
        <div className="flex aspect-[1.6] items-center justify-center rounded-xl border border-border bg-card px-4 text-center text-lg text-muted-foreground transition-colors group-hover:border-input">
          {project.name}
        </div>
        <div className="mt-3 flex items-center gap-2 px-0.5">
          <h2 className="truncate font-medium text-base">{project.name}</h2>
          {project.role === "LEAD" ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
              Lead
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
          <span className="text-muted-foreground text-sm">
            Edited {editedAgo(new Date(project.edited_at), now)}
          </span>
          <Members members={project.members} />
        </div>
      </Link>
      {actions ? (
        <div className="absolute top-2.5 right-2.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </article>
  );
}
