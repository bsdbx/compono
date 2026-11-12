"use client";

import { ChevronLeft, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Team } from "@/api/types.gen";
import { AccountMenu } from "@/components/account-menu";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { name: "General", path: "settings", icon: SlidersHorizontal },
  { name: "Members", path: "settings/members", icon: Users },
] as const;

/** A team settings page: the sections in the sidebar, the page's title and description, then its content. */
export function SettingsShell({
  team,
  section,
  description,
  children,
}: {
  team: Team;
  section: (typeof SECTIONS)[number]["name"];
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1">
      <aside className="flex w-59 shrink-0 flex-col border-sidebar-border border-r bg-sidebar">
        <div className="p-2">
          <Link
            href={`/${team.url}`}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground text-sm hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Back to projects
          </Link>
        </div>
        <nav aria-label="Team settings" className="flex-1 px-2 py-1">
          <p className="px-2 pt-1.5 pb-1.5 text-subtle-foreground text-xs">
            {team.name}
          </p>
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map(({ name, path, icon: Icon }) => (
              <li key={name}>
                <Link
                  href={`/${team.url}/${path}`}
                  aria-current={name === section ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2 font-medium text-sm",
                    name === section
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-sidebar-border border-t p-2">
          <AccountMenu />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto px-8 pt-14 pb-16">
        <div className="mx-auto max-w-170">
          <h1 className="font-semibold text-xl tracking-[-0.01em]">
            {section}
          </h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            {description}
          </p>
          <hr className="mt-8 mb-6" />
          {children}
        </div>
      </main>
    </div>
  );
}

/** A row of the danger zone: what an action does, and its button. */
export function DangerRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div>
        <p className="font-medium text-base">{title}</p>
        <p className="mt-0.5 text-base text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
