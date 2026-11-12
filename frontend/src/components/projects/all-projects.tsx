"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { teamProjectsOptions } from "@/api/@tanstack/react-query.gen";
import type { ListedProject, Team } from "@/api/types.gen";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectSettings } from "@/components/projects/project-settings";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

const SORTS = {
  "Last edited": (a: ListedProject, b: ListedProject) =>
    b.edited_at.localeCompare(a.edited_at),
  Name: (a: ListedProject, b: ListedProject) => a.name.localeCompare(b.name),
} as const;

type Sort = keyof typeof SORTS;

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 pb-16 text-center">
      <p className="font-medium text-lg">{title}</p>
      <div className="text-base text-muted-foreground">{children}</div>
    </div>
  );
}

/** The team's projects that the account can see, as cards, with search and sorting. */
export function AllProjects({ team }: { team: Team }) {
  const projects = useQuery(
    teamProjectsOptions({ path: { team_url: team.url } }),
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("Last edited");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ListedProject>();
  // Owners create projects; leads and developers are added to them
  const owner = team.role === "OWNER";
  const now = new Date();

  const all = projects.data ?? [];
  const query = search.trim().toLowerCase();
  const shown = all
    .filter((project) => project.name.toLowerCase().includes(query))
    .toSorted(SORTS[sort]);

  let content: ReactNode;
  if (projects.isPending) {
    content = (
      <div
        aria-busy
        className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-x-5 gap-y-8 p-6"
      >
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div
            key={index}
            className="aspect-[1.6] animate-pulse rounded-xl bg-card"
          />
        ))}
      </div>
    );
  } else if (projects.isError) {
    content = (
      <Message title="Couldn’t load projects">
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => void projects.refetch()}
        >
          Try again
        </Button>
      </Message>
    );
  } else if (all.length === 0) {
    content = (
      <Message title="No projects yet">
        {owner
          ? "Create one to start building components."
          : "When a lead adds you to a project, it shows up here."}
      </Message>
    );
  } else if (shown.length === 0) {
    content = (
      <Message title="No projects found">
        Nothing matches “{search.trim()}”.
      </Message>
    );
  } else {
    content = (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-x-5 gap-y-8 p-6">
        {shown.map((project) => (
          <ProjectCard
            key={project.id}
            teamUrl={team.url}
            project={project}
            now={now}
            actions={
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={`Settings of ${project.name}`}
                onClick={() => setEditing(project)}
              >
                <Settings className="size-4" />
              </Button>
            }
          />
        ))}
      </div>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-15 shrink-0 items-center gap-3 border-border border-b px-6">
        <h1 className="flex-1 font-semibold text-lg">
          All projects{" "}
          {projects.data && all.length > 0 ? (
            <span className="ml-1 font-normal text-muted-foreground">
              {all.length}
            </span>
          ) : null}
        </h1>
        {all.length > 0 ? (
          <>
            <div className="relative w-60">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" />
              <Input
                type="search"
                aria-label="Search projects"
                placeholder="Search projects"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-7.5 pl-8 text-sm"
              />
            </div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Sort by ${sort}`}
                >
                  <ArrowUpDown />
                  {sort}
                  <ChevronDown className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {(Object.keys(SORTS) as Sort[]).map((name) => (
                  <DropdownMenuItem
                    key={name}
                    className="h-8 text-sm"
                    onSelect={() => setSort(name)}
                  >
                    <span className="flex-1">{name}</span>
                    {name === sort ? <Check className="size-3.5" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        {owner ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New project
          </Button>
        ) : null}
      </header>
      {content}
      {owner ? (
        <NewProjectDialog
          team={team}
          open={creating}
          onOpenChange={setCreating}
        />
      ) : null}
      <ProjectSettings
        team={team}
        project={editing}
        onClose={() => setEditing(undefined)}
      />
    </main>
  );
}
