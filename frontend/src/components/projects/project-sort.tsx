import { Check } from "lucide-react";
import type { ListedProject } from "@/api/types";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export const PROJECT_SORTS = {
  "Last edited": (a: ListedProject, b: ListedProject) =>
    b.edited_at.localeCompare(a.edited_at),
  Name: (a: ListedProject, b: ListedProject) => a.name.localeCompare(b.name),
} as const;

export type ProjectSort = keyof typeof PROJECT_SORTS;

/** The same sort choices in the toolbar and the projects' background menu. */
export function ProjectSortItems({
  sort,
  onSort,
}: {
  sort: ProjectSort;
  onSort: (sort: ProjectSort) => void;
}) {
  return (Object.keys(PROJECT_SORTS) as ProjectSort[]).map((name) => (
    <DropdownMenuItem
      key={name}
      className="h-8 text-sm"
      onSelect={() => onSort(name)}
    >
      <span className="flex-1">{name}</span>
      {name === sort ? (
        <Check className="size-3.5" aria-label="Current sort" />
      ) : null}
    </DropdownMenuItem>
  ));
}
