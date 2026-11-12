"use client";

import { ChevronDown, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ListedComponent, Project, Team } from "@/api/types.gen";
import { useSignedInAccount, useSignOut } from "@/components/account";
import { Avatar } from "@/components/avatar";
import { NameInput } from "@/components/editor/name-input";
import { LogoMark } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function AccountButton() {
  const account = useSignedInAccount();
  const signOut = useSignOut();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex items-center gap-1 rounded-full p-0.5 hover:bg-accent data-[state=open]:bg-accent"
        >
          <Avatar id={account.id} name={account.name} className="size-6" />
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="truncate font-medium text-base">{account.name}</p>
          <p className="truncate text-muted-foreground text-xs">
            {account.email}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="h-8 text-base">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The editor's top bar: where the component is, its name to rename, and the account. */
export function TopBar({
  team,
  project,
  component,
  renameNow,
  onRenamed,
}: {
  team: Team;
  project: Project;
  /** The open component, if any */
  component: ListedComponent | undefined;
  /** Starts renaming the component, as a new one does */
  renameNow: boolean;
  onRenamed: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const path = { team_url: team.url, project_url: project.url };
  return (
    <header className="flex h-10.25 shrink-0 items-center gap-4 border-border border-b bg-sidebar pr-3 pl-3.5">
      <Link href="/" aria-label="Compono home" className="flex">
        <LogoMark size={18} />
      </Link>
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm"
      >
        <Link href={`/${team.url}`} className="truncate hover:text-foreground">
          {team.name}
        </Link>
        <ChevronRight className="size-3 shrink-0 text-subtle-foreground" />
        {component === undefined ? (
          <span aria-current="page" className="truncate text-foreground">
            {project.name}
          </span>
        ) : (
          <>
            <Link
              href={`/${team.url}/${project.url}`}
              className="truncate hover:text-foreground"
            >
              {project.name}
            </Link>
            <ChevronRight className="size-3 shrink-0 text-subtle-foreground" />
            {renaming || renameNow ? (
              <NameInput
                key={component.id}
                path={path}
                component={component}
                projectName={project.name}
                className="-mx-1.5"
                inputClassName="field-sizing-content max-w-80 font-medium"
                onDone={() => {
                  setRenaming(false);
                  onRenamed();
                }}
              />
            ) : (
              <button
                type="button"
                aria-current="page"
                aria-label={`Rename ${component.name}`}
                onClick={() => setRenaming(true)}
                className="-mx-1.5 h-5.5 truncate rounded-md border border-transparent px-1.5 font-medium text-foreground hover:border-border"
              >
                {component.name}
              </button>
            )}
          </>
        )}
      </nav>
      <div className="ml-auto">
        <AccountButton />
      </div>
    </header>
  );
}
