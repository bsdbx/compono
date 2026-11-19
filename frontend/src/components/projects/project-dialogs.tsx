import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
  deleteProjectMutation,
  leaveProjectMutation,
  projectMembersOptions,
  projectMembersQueryKey,
} from "@/api/queries";
import type { Project, Team } from "@/api/types";
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
import { Input } from "@/components/ui/input";

export function DeleteProjectDialog({
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

/** A lead hands over before leaving other members behind; a sole member can leave. */
export function LeaveProjectDialog({
  team,
  project,
  open,
  onOpenChange,
  onLeft,
  onGoToMembers,
}: {
  team: Team;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft: () => void;
  onGoToMembers: () => void;
}) {
  const queryClient = useQueryClient();
  const [lastLead, setLastLead] = useState(false);
  const path = { team_url: team.url, project_url: project.url };
  const leave = useMutation({
    ...leaveProjectMutation(),
    onSuccess: onLeft,
    onError: (error) => {
      // Another lead may have left since the panel opened, so the members catch up
      setLastLead(error.detail === "last_lead");
      void queryClient.invalidateQueries({
        queryKey: projectMembersQueryKey({ path }),
      });
    },
  });
  const members = useQuery({
    ...projectMembersOptions({ path }),
    enabled: open,
  });
  const onlyLead =
    project.role === "LEAD" &&
    (members.data?.length ?? 0) > 1 &&
    members.data?.filter((member) => member.role === "LEAD").length === 1;
  const handOver = onlyLead || lastLead;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setLastLead(false);
        leave.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {handOver
              ? `Hand over ${project.name} first`
              : `Leave ${project.name}?`}
          </DialogTitle>
          <DialogDescription>
            {handOver
              ? `You’re the only lead of ${project.name}. Make another member a lead, then you can leave.`
              : team.role === "OWNER"
                ? `You’ll still manage it as an owner of ${team.name}.`
                : "You’ll lose access to its components until someone adds you again."}
          </DialogDescription>
        </DialogHeader>
        {(leave.isError || members.isError) && !handOver ? (
          <p role="alert" className="text-error text-sm">
            That didn’t work. Try again.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          {handOver ? (
            <Button onClick={onGoToMembers}>Go to members</Button>
          ) : (
            <Button
              variant="destructive"
              disabled={leave.isPending || members.isPending || members.isError}
              onClick={() => leave.mutate({ path })}
            >
              Leave project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
