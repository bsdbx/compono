import { FolderOpen, LogOut, Settings, Trash2 } from "lucide-react";
import type { ListedProject, Team } from "@/api/types";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PointerMenu } from "@/components/ui/pointer-menu";
import { Link } from "@/lib/navigation";

/** Project actions follow the same roles as the project's settings. */
export function ProjectContextMenu({
  team,
  project,
  x,
  y,
  onClose,
  onSettings,
  onDelete,
  onLeave,
}: {
  team: Team;
  project: ListedProject;
  x: number;
  y: number;
  onClose: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onLeave: () => void;
}) {
  const manage = team.role === "OWNER" || project.role === "LEAD";
  return (
    <PointerMenu x={x} y={y} onClose={onClose} className="w-48">
      <DropdownMenuItem asChild className="h-8 text-sm">
        <Link href={`/${team.url}/${project.url}`}>
          <FolderOpen />
          Open project
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem className="h-8 text-sm" onSelect={onSettings}>
        <Settings />
        {manage ? "Project settings" : "Project details"}
      </DropdownMenuItem>
      {project.role !== null || manage ? <DropdownMenuSeparator /> : null}
      {project.role !== null ? (
        <DropdownMenuItem className="h-8 text-sm" onSelect={onLeave}>
          <LogOut />
          Leave project
        </DropdownMenuItem>
      ) : null}
      {manage ? (
        <DropdownMenuItem
          className="h-8 text-sm"
          variant="destructive"
          onSelect={onDelete}
        >
          <Trash2 />
          Delete project
        </DropdownMenuItem>
      ) : null}
    </PointerMenu>
  );
}
