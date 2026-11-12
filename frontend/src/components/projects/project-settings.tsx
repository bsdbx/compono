"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  MoreHorizontal,
  UserCog,
  UserMinus,
  X,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import {
  deleteProjectMutation,
  leaveProjectMutation,
  projectMembersOptions,
  projectMembersQueryKey,
  projectOptions,
  removeProjectMemberMutation,
  setProjectMemberMutation,
  teamMembersOptions,
  teamProjectsQueryKey,
} from "@/api/@tanstack/react-query.gen";
import { updateProject } from "@/api/sdk.gen";
import type {
  ListedProject,
  Project,
  ProjectMember,
  ProjectRole,
  Team,
} from "@/api/types.gen";
import { useSignedInAccount } from "@/components/account";
import { Avatar } from "@/components/avatar";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ROLE: Record<ProjectRole, string> = {
  LEAD: "Lead",
  DEVELOPER: "Developer",
};

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="px-5 py-5">
      {title ? <h3 className="mb-3.5 font-medium text-base">{title}</h3> : null}
      {children}
    </section>
  );
}

/** A label as the design's panel has them: small and grey. */
function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-muted-foreground text-sm">
      {children}
    </label>
  );
}

/** The name and description, saved as each field is left. A lead's or owner's to change. */
function General({
  team,
  project,
  canEdit,
  leads,
  onSaved,
}: {
  team: Team;
  project: Project;
  canEdit: boolean;
  leads: ProjectMember[];
  onSaved: (project: Project) => void;
}) {
  const id = useId();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [error, setError] = useState<string>();

  async function save(changes: { name?: string; description?: string }) {
    try {
      const { data, error: failed } = await updateProject({
        path: { team_url: team.url, project_url: project.url },
        body: changes,
      });
      if (data !== undefined) {
        setError(undefined);
        onSaved(data);
        return;
      }
      setError(
        failed?.detail === "name_taken"
          ? `${team.name} already has a project with this name.`
          : "Couldn’t save. Try again.",
      );
    } catch {
      setError("Couldn’t save. Try again.");
    }
  }

  if (!canEdit) {
    return (
      <dl className="grid grid-cols-[6.75rem_1fr] gap-x-4 gap-y-3.5 text-base">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{project.name}</dd>
        <dt className="text-muted-foreground">Description</dt>
        <dd>{project.description || "None"}</dd>
        <dt className="text-muted-foreground">
          {leads.length === 1 ? "Lead" : "Leads"}
        </dt>
        <dd className="flex flex-col gap-2">
          {leads.map((lead) => (
            <span key={lead.id} className="flex items-center gap-2">
              <Avatar id={lead.id} name={lead.name} className="size-6" />
              {lead.name}
            </span>
          ))}
        </dd>
      </dl>
    );
  }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          aria-invalid={error !== undefined}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() !== project.name && name.trim() !== "") {
              void save({ name: name.trim() });
            }
          }}
          className="h-8"
        />
        {error ? <p className="text-error text-sm">{error}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <textarea
          id={`${id}-description`}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => {
            if (description.trim() !== project.description) {
              void save({ description: description.trim() });
            }
          }}
          className="w-full resize-none rounded-md border border-input bg-field px-3 py-1.5 text-base"
        />
      </div>
    </div>
  );
}

function MemberRow({
  member,
  you,
  canManage,
  onRole,
  onRemove,
}: {
  member: ProjectMember;
  you: boolean;
  canManage: boolean;
  onRole: (role: ProjectRole) => void;
  onRemove: () => void;
}) {
  const other: ProjectRole = member.role === "LEAD" ? "DEVELOPER" : "LEAD";
  return (
    <li className="flex items-center gap-3 py-1.5">
      <Avatar id={member.id} name={member.name} className="size-7 text-2xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-base leading-tight">
          {member.name}
          {you ? (
            <span className="font-normal text-muted-foreground"> (you)</span>
          ) : null}
        </p>
        <p className="truncate text-muted-foreground text-sm">{member.email}</p>
      </div>
      <span className="text-base text-foreground/85">{ROLE[member.role]}</span>
      {canManage ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              aria-label={`Change ${member.name}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="h-9 text-base"
              onSelect={() => onRole(other)}
            >
              <UserCog className="size-4" />
              Make {ROLE[other].toLowerCase()}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="h-9 text-base text-error"
              onSelect={onRemove}
            >
              <UserMinus className="size-4" />
              Remove from project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

/** The project's members, and for leads and owners, adding team members and changing roles. */
function Members({
  team,
  project,
  members,
  canManage,
}: {
  team: Team;
  project: Project;
  members: ProjectMember[];
  canManage: boolean;
}) {
  const account = useSignedInAccount();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState("");
  const path = { team_url: team.url, project_url: project.url };
  const { data: teamMembers = [] } = useQuery({
    ...teamMembersOptions({ path: { team_url: team.url } }),
    enabled: canManage,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: projectMembersQueryKey({ path }),
      }),
      queryClient.invalidateQueries({
        queryKey: teamProjectsQueryKey({ path: { team_url: team.url } }),
      }),
    ]);
  const setRole = useMutation({
    ...setProjectMemberMutation(),
    onSuccess: refresh,
  });
  const remove = useMutation({
    ...removeProjectMemberMutation(),
    onSuccess: refresh,
  });
  const inProject = new Set(members.map((member) => member.id));
  const addable = teamMembers.filter((member) => !inProject.has(member.id));
  const chosen = addable.find((member) => member.id === adding);

  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        // The alpha has no email, so people are added from the team, as developers
        <div className="flex gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild disabled={addable.length === 0}>
              <button
                type="button"
                aria-label="Team member to add"
                className="flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-field px-3 text-left text-base disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    "truncate",
                    chosen ? "" : "text-subtle-foreground",
                  )}
                >
                  {chosen
                    ? chosen.name
                    : addable.length === 0
                      ? `Everyone in ${team.name} is in this project`
                      : "Add a team member"}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64">
              {addable.map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  className="h-10 text-base"
                  onSelect={() => setAdding(member.id)}
                >
                  <Avatar
                    id={member.id}
                    name={member.name}
                    className="size-6"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {member.name}{" "}
                    <span className="text-muted-foreground text-sm">
                      {member.email}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="h-8"
            disabled={chosen === undefined || setRole.isPending}
            onClick={() => {
              if (chosen) {
                setRole.mutate(
                  {
                    path: { ...path, account_id: chosen.id },
                    body: { role: "DEVELOPER" },
                  },
                  { onSuccess: () => setAdding("") },
                );
              }
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      <ul>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            you={member.id === account.id}
            canManage={canManage}
            onRole={(role) =>
              setRole.mutate({
                path: { ...path, account_id: member.id },
                body: { role },
              })
            }
            onRemove={() =>
              remove.mutate({ path: { ...path, account_id: member.id } })
            }
          />
        ))}
      </ul>
    </div>
  );
}

function DangerRow({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-base">{title}</p>
        <p className="text-muted-foreground text-base">{description}</p>
      </div>
      <Button variant="secondary" className="text-error" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function DeleteProjectDialog({
  team,
  project,
  open,
  onOpenChange,
  onDeleted,
}: {
  team: Team;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const confirm = `${team.url}/${project.url}`;
  const remove = useMutation({
    ...deleteProjectMutation(),
    onSuccess: onDeleted,
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setTyped("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {project.name}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the project and all of its components, and
            removes access for every member.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${id}-confirm`}
            className="text-muted-foreground text-sm"
          >
            Type{" "}
            <span className="font-semibold text-foreground">{confirm}</span> to
            confirm
          </label>
          <Input
            id={`${id}-confirm`}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={typed !== confirm || remove.isPending}
            onClick={() =>
              remove.mutate({
                path: { team_url: team.url, project_url: project.url },
              })
            }
          >
            Delete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveProjectDialog({
  team,
  project,
  open,
  onOpenChange,
  onLeft,
}: {
  team: Team;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft: () => void;
}) {
  const leave = useMutation({ ...leaveProjectMutation(), onSuccess: onLeft });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave {project.name}?</DialogTitle>
          <DialogDescription>
            You’ll lose access to its components until someone adds you again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={leave.isPending}
            onClick={() =>
              leave.mutate({
                path: { team_url: team.url, project_url: project.url },
              })
            }
          >
            Leave project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Settings({
  team,
  listed,
  onClose,
}: {
  team: Team;
  listed: ListedProject;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // The URL changes with the name, so the panel follows the latest one
  const [url, setUrl] = useState(listed.url);
  const [dialog, setDialog] = useState<"delete" | "leave">();
  const path = { team_url: team.url, project_url: url };
  const { data: project } = useQuery(projectOptions({ path }));
  const { data: members = [] } = useQuery(projectMembersOptions({ path }));
  // Owners and leads manage a project; developers build in it
  const canManage = team.role === "OWNER" || project?.role === "LEAD";
  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: teamProjectsQueryKey({ path: { team_url: team.url } }),
    });
  const gone = async () => {
    await refreshList();
    onClose();
  };

  if (project === undefined) {
    return null;
  }
  return (
    <>
      <SheetHeader className="flex-row items-center justify-between gap-3 border-border border-b px-5 py-3">
        <SheetTitle className="truncate">{project.name}</SheetTitle>
        <SheetDescription className="sr-only">
          The project’s settings
        </SheetDescription>
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetClose>
      </SheetHeader>
      <div className="flex-1 divide-y divide-border overflow-y-auto">
        <Section title="General">
          <General
            key={project.url}
            team={team}
            project={project}
            canEdit={canManage}
            leads={members.filter((member) => member.role === "LEAD")}
            onSaved={(saved) => {
              queryClient.setQueryData(
                projectOptions({
                  path: { team_url: team.url, project_url: saved.url },
                }).queryKey,
                saved,
              );
              setUrl(saved.url);
              void refreshList();
            }}
          />
        </Section>
        <Section title="Members">
          <Members
            team={team}
            project={project}
            members={members}
            canManage={canManage}
          />
        </Section>
        {canManage ? (
          // Leads and owners delete; a lead leaves by removing themselves, as the design has it
          <Section title="Danger zone">
            <DangerRow
              title="Delete project"
              description="Removes the project and all its components."
              action="Delete"
              onClick={() => setDialog("delete")}
            />
          </Section>
        ) : project.role !== null ? (
          <Section>
            <DangerRow
              title="Leave project"
              description="You’ll need a lead to add you again."
              action="Leave"
              onClick={() => setDialog("leave")}
            />
          </Section>
        ) : null}
      </div>
      <DeleteProjectDialog
        team={team}
        project={project}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : undefined)}
        onDeleted={() => void gone()}
      />
      <LeaveProjectDialog
        team={team}
        project={project}
        open={dialog === "leave"}
        onOpenChange={(open) => setDialog(open ? "leave" : undefined)}
        onLeft={() => void gone()}
      />
    </>
  );
}

/** A project's settings, in a panel beside the projects. */
export function ProjectSettings({
  team,
  project,
  onClose,
}: {
  team: Team;
  project: ListedProject | undefined;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={project !== undefined}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent showCloseButton={false} className="gap-0 p-0">
        {project ? (
          <Settings
            key={project.id}
            team={team}
            listed={project}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
