import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** A menu that opens at the pointer, like a right click's. */
export function PointerMenu({
  x,
  y,
  onClose,
  children,
  className,
  onCloseAutoFocus,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  onCloseAutoFocus?: (event: Event) => void;
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
        className={cn("w-47", className)}
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
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
