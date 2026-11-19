import { Plus } from "lucide-react";
import {
  type ProjectSort,
  ProjectSortItems,
} from "@/components/projects/project-sort";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PointerMenu } from "@/components/ui/pointer-menu";

export function ProjectsBackgroundMenu({
  x,
  y,
  owner,
  sort,
  onSort,
  onCreate,
  onClose,
}: {
  x: number;
  y: number;
  owner: boolean;
  sort: ProjectSort;
  onSort: (sort: ProjectSort) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <PointerMenu x={x} y={y} onClose={onClose} className="w-44">
      {owner ? (
        <>
          <DropdownMenuItem className="h-8 text-sm" onSelect={onCreate}>
            <Plus />
            New project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuLabel>Sort by</DropdownMenuLabel>
      <ProjectSortItems sort={sort} onSort={onSort} />
    </PointerMenu>
  );
}
