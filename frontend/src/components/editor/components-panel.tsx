"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Component as ComponentIcon,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  componentQueryKey,
  deleteComponentMutation,
  duplicateComponentMutation,
  projectComponentsQueryKey,
} from "@/api/@tanstack/react-query.gen";
import type { ListedComponent, Project, Team } from "@/api/types.gen";
import { NameInput } from "@/components/editor/name-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** A panel at the left, filled while it shows. */
function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
      className="size-4"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {open ? (
        <path
          d="M5 3h4v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
          fill="currentColor"
        />
      ) : (
        <path d="M9 3v18" />
      )}
    </svg>
  );
}

/** Widths of the loading rows, like names of different lengths */
const LOADING = [118, 91, 133, 105, 125, 84];

/** The name, with the part that matches the search marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query === "" ? -1 : text.toLowerCase().indexOf(query);
  if (at === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-xs bg-primary/30 text-inherit">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 pt-12 text-center">
      <p className="font-medium text-sm">{title}</p>
      <div className="text-muted-foreground text-xs">{children}</div>
    </div>
  );
}

function Row({
  component,
  href,
  open,
  query,
  renaming,
  rename,
  onRename,
  onDuplicate,
  onDelete,
}: {
  component: ListedComponent;
  href: string;
  open: boolean;
  query: string;
  renaming: boolean;
  rename: ReactNode;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const icon = (
    <ComponentIcon
      className={cn(
        "size-3.5 shrink-0",
        open ? "text-primary" : "text-muted-foreground",
      )}
    />
  );
  if (renaming) {
    return (
      <li className="flex h-7.5 items-center gap-2 pr-1 pl-2">
        {icon}
        {rename}
      </li>
    );
  }
  return (
    <li
      className={cn(
        "group relative rounded-md has-[[data-state=open]]:bg-accent/60",
        open ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <Link
        href={href}
        aria-current={open ? "page" : undefined}
        className="flex h-7.5 items-center gap-2 rounded-md pr-8 pl-2 text-sm"
      >
        {icon}
        <span className="truncate">
          <Highlight text={component.name} query={query} />
        </span>
      </Link>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${component.name}`}
            className="absolute top-1/2 right-1 size-6 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem className="h-8 text-sm" onSelect={onRename}>
            <Pencil className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem className="h-8 text-sm" onSelect={onDuplicate}>
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="h-8 text-sm"
            onSelect={onDelete}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DeleteDialog({
  team,
  project,
  component,
  onOpenChange,
  onDeleted,
}: {
  team: Team;
  project: Project;
  component: ListedComponent;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = useMutation({
    ...deleteComponentMutation(),
    onSuccess: onDeleted,
  });
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {component.name}?</DialogTitle>
          <DialogDescription>
            It’s deleted for everyone in {project.name}. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        {remove.isError ? (
          <p role="alert" className="text-error text-sm">
            That didn’t work. Try again.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate({
                path: {
                  team_url: team.url,
                  project_url: project.url,
                  component_id: component.id,
                },
              })
            }
          >
            Delete component
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The project's components, newest first, to open, find, create, rename, duplicate and delete. */
export function ComponentsPanel({
  team,
  project,
  components,
  failed,
  onRetry,
  openId,
  onCreate,
  creating,
}: {
  team: Team;
  project: Project;
  /** Undefined while they load */
  components: ListedComponent[] | undefined;
  failed: boolean;
  onRetry: () => void;
  openId: string | undefined;
  onCreate: () => void;
  creating: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [hidden, setHidden] = useState(false);
  const [search, setSearch] = useState("");
  const [renaming, setRenaming] = useState<string>();
  const [deleting, setDeleting] = useState<ListedComponent>();
  const path = { team_url: team.url, project_url: project.url };
  const base = `/${team.url}/${project.url}`;
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: projectComponentsQueryKey({ path }),
    });

  const duplicate = useMutation({
    ...duplicateComponentMutation(),
    onSuccess: (copy, { path: { component_id } }) => {
      queryClient.setQueryData(
        componentQueryKey({ path: { ...path, component_id: copy.id } }),
        copy,
      );
      void refresh();
      const original =
        components?.find((listed) => listed.id === component_id)?.name ??
        "The component";
      toast({
        icon: <CircleCheck className="text-success" />,
        title: `${original} duplicated`,
        description: `The copy is ${copy.name}.`,
        action: {
          label: "Open",
          onClick: () => router.push(`${base}/${copy.id}`),
        },
      });
    },
    onError: () =>
      toast({
        icon: <CircleAlert />,
        title: "Couldn’t duplicate. Try again.",
      }),
  });

  if (hidden) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center border-border border-r bg-sidebar pt-1.25">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show components"
          onClick={() => setHidden(false)}
        >
          <PanelIcon open={false} />
        </Button>
      </aside>
    );
  }

  const query = search.trim().toLowerCase();
  const shown = (components ?? []).filter((listed) =>
    listed.name.toLowerCase().includes(query),
  );

  let list: ReactNode;
  if (failed) {
    list = (
      <Message title="Couldn’t load components">
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          Try again
        </Button>
      </Message>
    );
  } else if (components === undefined) {
    list = (
      <ul
        aria-busy
        aria-label="Loading components"
        className="flex flex-col gap-0.5"
      >
        {LOADING.map((width) => (
          <li key={width} className="flex h-7.5 items-center gap-2 px-2">
            <span className="size-3.5 animate-pulse rounded-xs bg-muted" />
            <span
              className="h-2.5 animate-pulse rounded-full bg-muted"
              style={{ width }}
            />
          </li>
        ))}
      </ul>
    );
  } else if (components.length === 0) {
    list = (
      <Message title="No components yet">Create one to start building.</Message>
    );
  } else if (shown.length === 0) {
    list = (
      <Message title="No components found">
        Nothing matches “{search.trim()}”.
        <div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 h-7"
            onClick={() => setSearch("")}
          >
            Clear search
          </Button>
        </div>
      </Message>
    );
  } else {
    list = (
      <ul aria-label="Components" className="flex flex-col gap-0.5">
        {shown.map((listed) => (
          <Row
            key={listed.id}
            component={listed}
            href={`${base}/${listed.id}`}
            open={listed.id === openId}
            query={query}
            renaming={renaming === listed.id}
            rename={
              <NameInput
                path={path}
                component={listed}
                projectName={project.name}
                className="-ml-1.5 flex-1"
                inputClassName="w-full"
                onDone={() => setRenaming(undefined)}
              />
            }
            onRename={() => setRenaming(listed.id)}
            onDuplicate={() =>
              duplicate.mutate({ path: { ...path, component_id: listed.id } })
            }
            onDelete={() => setDeleting(listed)}
          />
        ))}
      </ul>
    );
  }

  return (
    <aside
      aria-label="Components"
      className="flex w-56 shrink-0 flex-col border-border border-r bg-sidebar"
    >
      <div className="flex h-10 shrink-0 items-center justify-between pr-1.5 pl-3.5">
        <h2 className="font-semibold text-sm">
          Components
          {components !== undefined ? (
            // The space keeps "Components 6" apart for screen readers too
            <>
              {" "}
              <span className="ml-0.5 font-normal text-muted-foreground">
                {components.length}
              </span>
            </>
          ) : null}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Hide components"
          onClick={() => setHidden(true)}
        >
          <PanelIcon open />
        </Button>
      </div>
      <div className="flex flex-col gap-2 px-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="Search components"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
              }
            }}
            className="h-7.5 w-full rounded-md border border-input bg-field pr-8 pl-8 text-sm outline-none focus-visible:border-primary focus-visible:outline-none"
          />
          {search !== "" ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-input text-foreground/80 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
        <Button
          variant="secondary"
          className="h-7 w-full text-sm"
          disabled={creating}
          onClick={onCreate}
        >
          <Plus className="size-3.5" />
          New component
        </Button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list}
      </div>
      {deleting ? (
        <DeleteDialog
          team={team}
          project={project}
          component={deleting}
          onOpenChange={(open) => {
            if (!open) {
              setDeleting(undefined);
            }
          }}
          onDeleted={() => {
            const gone = deleting;
            setDeleting(undefined);
            // Gone from the list at once, so that nothing opens it again
            queryClient.setQueryData<ListedComponent[]>(
              projectComponentsQueryKey({ path }),
              (list) => list?.filter((listed) => listed.id !== gone.id),
            );
            queryClient.removeQueries({
              queryKey: componentQueryKey({
                path: { ...path, component_id: gone.id },
              }),
            });
            void refresh();
            toast({
              icon: <Trash2 className="text-error" />,
              title: `${gone.name} deleted`,
            });
            if (gone.id === openId) {
              router.replace(base);
            }
          }}
        />
      ) : null}
    </aside>
  );
}
