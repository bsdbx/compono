"use client";

import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** A menu item in a canvas menu, and the line between groups of them. */
export const MENU_ITEM = "h-6.5 min-h-6.5 text-sm focus:bg-highlight";
export const MENU_SEPARATOR = "mx-0 bg-input";

/** A menu that opens at the pointer, like a right click's. */
export function PointerMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <span className="fixed size-0" style={{ left: x, top: y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        className="w-47"
        // Letting go of the right button that opened the menu doesn't choose the item under it
        onPointerUpCapture={(event) => {
          if (event.button === 2) {
            event.preventDefault();
          }
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
