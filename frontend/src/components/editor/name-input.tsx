"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useRef, useState } from "react";
import {
  componentQueryKey,
  projectComponentsQueryKey,
  renameComponentMutation,
} from "@/api/@tanstack/react-query.gen";
import type { Component, ListedComponent } from "@/api/types.gen";
import { cn } from "@/lib/utils";

const NAME = /^[A-Z][A-Za-z0-9]*$/;
const MAX_LENGTH = 64;

/** Why the API would refuse the name, if it would. React reads a lowercase name as an HTML tag. */
export function nameProblem(name: string): string | undefined {
  if (!NAME.test(name)) {
    return "Start with a capital letter, then use only letters and digits.";
  }
  if (name.length > MAX_LENGTH) {
    return `Use at most ${MAX_LENGTH} characters.`;
  }
  return undefined;
}

/**
 * Renames a component in place. Enter saves and Escape cancels.
 * Leaving the field saves too, and drops a name that can't be saved.
 */
export function NameInput({
  path,
  component,
  projectName,
  onDone,
  className,
  inputClassName,
}: {
  path: { team_url: string; project_url: string };
  component: Pick<ListedComponent, "id" | "name">;
  projectName: string;
  onDone: () => void;
  /** The field's place, such as a negative margin that keeps the name where it was */
  className?: string;
  inputClassName?: string;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(component.name);
  const [error, setError] = useState<string>();
  // Set once Enter, Escape or leaving the field has finished, so that it finishes once
  const finished = useRef(false);
  // Set while Enter's rename is on its way, which leaving the field leaves alone
  const saving = useRef(false);
  const rename = useMutation({
    ...renameComponentMutation(),
    onSuccess: (renamed) => {
      queryClient.setQueryData<ListedComponent[]>(
        projectComponentsQueryKey({ path }),
        (list) =>
          list?.map((listed) => (listed.id === renamed.id ? renamed : listed)),
      );
      queryClient.setQueryData<Component>(
        componentQueryKey({ path: { ...path, component_id: renamed.id } }),
        (old) => old && { ...old, name: renamed.name },
      );
    },
  });

  async function save(): Promise<boolean> {
    const name = value.trim();
    if (name === "" || name === component.name) {
      return true;
    }
    const problem = nameProblem(name);
    if (problem !== undefined) {
      setError(problem);
      return false;
    }
    saving.current = true;
    try {
      await rename.mutateAsync({
        path: { ...path, component_id: component.id },
        body: { name },
      });
      return true;
    } catch (failed) {
      const detail =
        typeof failed === "object" && failed !== null && "detail" in failed
          ? failed.detail
          : undefined;
      setError(
        detail === "name_taken"
          ? `${name} already exists in ${projectName}`
          : "Couldn’t rename. Try again.",
      );
      return false;
    } finally {
      saving.current = false;
    }
  }

  function finish() {
    finished.current = true;
    onDone();
  }

  return (
    <span className={cn("relative flex min-w-0", className)}>
      <input
        // biome-ignore lint/a11y/noAutofocus: renaming starts from a click or a new component, and types at once
        autoFocus
        aria-label="Component name"
        aria-invalid={error !== undefined}
        spellCheck={false}
        autoComplete="off"
        value={value}
        // Not disabled, which would take the focus away and count as leaving the field
        readOnly={rename.isPending}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setValue(event.target.value);
          setError(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish();
          } else if (event.key === "Enter") {
            event.preventDefault();
            void save().then((saved) => {
              if (saved) {
                finish();
              }
            });
          }
        }}
        onBlur={() => {
          if (!finished.current && !saving.current) {
            void save().then(finish);
          }
        }}
        className={cn(
          "h-5.5 min-w-0 rounded-md border border-primary/70 bg-field px-1.5 text-foreground text-sm outline-none selection:bg-primary/40 focus-visible:outline-none aria-invalid:border-error-border",
          inputClassName,
        )}
      />
      {error ? (
        <span
          role="alert"
          className="absolute top-full left-0 z-50 mt-2 flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 font-normal text-error text-xs shadow-xl"
        >
          <CircleAlert className="size-3 shrink-0" />
          {error}
        </span>
      ) : null}
    </span>
  );
}
