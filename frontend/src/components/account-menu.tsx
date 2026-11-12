"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useSignedInAccount, useSignOut } from "@/components/account";
import { Avatar } from "@/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The signed-in account at the bottom of the sidebar, with a menu to sign out. */
export function AccountMenu() {
  const account = useSignedInAccount();
  const signOut = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-accent data-[state=open]:bg-accent"
        >
          <Avatar id={account.id} name={account.name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-base">
              {account.name}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {account.email}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={8}>
        <DropdownMenuItem onSelect={signOut} className="h-9 text-base">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
