"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Plus } from "lucide-react";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  componentOptions,
  componentQueryKey,
  createComponentMutation,
  projectComponentsOptions,
  projectComponentsQueryKey,
  projectOptions,
  teamOptions,
} from "@/api/@tanstack/react-query.gen";
import { SignedIn } from "@/components/account";
import { ComponentsPanel } from "@/components/editor/components-panel";
import { Draft } from "@/components/editor/draft";
import { StatusBar } from "@/components/editor/status-bar";
import { TopBar } from "@/components/editor/top-bar";
import { Button } from "@/components/ui/button";
import { Toasts, useToast } from "@/components/ui/toast";

type Params = { team: string; project: string; component?: string };

/** The right column, which the Preview and the properties panel fill in later. */
function Inspector() {
  return (
    <aside className="flex w-78.5 shrink-0 flex-col border-border border-l bg-sidebar">
      <section aria-label="Preview" className="px-3 pb-3">
        <h2 className="flex h-10 items-center px-0.5 font-semibold text-sm">
          Preview
        </h2>
        <div className="mt-0.5 flex h-43 items-center justify-center rounded-lg border border-border bg-card font-medium text-2xs">
          Nothing to render yet
        </div>
      </section>
      <section aria-label="Properties" className="border-border border-t">
        <h2 className="flex h-10.5 items-center border-border border-b px-3.5 font-semibold text-sm">
          Properties
        </h2>
        <p className="mt-10.25 text-center text-muted-foreground text-xs">
          Select a node to edit its properties.
        </p>
      </section>
    </aside>
  );
}

function EditorContent() {
  const params = useParams<Params>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const path = { team_url: params.team, project_url: params.project };
  const base = `/${params.team}/${params.project}`;
  const openId = params.component;
  const team = useQuery({
    ...teamOptions({ path: { team_url: params.team } }),
    retry: false,
  });
  const project = useQuery({ ...projectOptions({ path }), retry: false });
  const list = useQuery(projectComponentsOptions({ path }));
  const open = useQuery({
    ...componentOptions({ path: { ...path, component_id: openId ?? "" } }),
    enabled: openId !== undefined,
    retry: false,
  });
  const [draft] = useState(() => new Draft(queryClient));
  // A new component, whose name is selected to type over
  const [named, setNamed] = useState<string>();
  // The newest first, as a new one is the one to work on
  const components = list.data?.toReversed();
  const newest = components?.[0]?.id;

  const create = useMutation({
    ...createComponentMutation(),
    onSuccess: (created) => {
      queryClient.setQueryData(
        componentQueryKey({ path: { ...path, component_id: created.id } }),
        created,
      );
      void queryClient.invalidateQueries({
        queryKey: projectComponentsQueryKey({ path }),
      });
      setNamed(created.id);
      router.push(`${base}/${created.id}`);
    },
    onError: () =>
      toast({
        icon: <CircleAlert className="text-error" />,
        title: "Couldn’t create a component. Try again.",
      }),
  });

  // Opening the project opens its newest component
  useEffect(() => {
    if (openId === undefined && newest !== undefined) {
      router.replace(`${base}/${newest}`);
    }
  }, [openId, newest, base, router]);

  // A component that isn't there: deleted by someone else, or a wrong address
  const missing = open.isError;
  useEffect(() => {
    if (missing) {
      router.replace(base);
    }
  }, [missing, base, router]);

  // Edits go to the open component, and what isn't saved yet is sent on leaving it
  const loaded = open.data;
  const team_url = params.team;
  const project_url = params.project;
  useEffect(() => {
    if (openId !== undefined && loaded?.id === openId) {
      draft.open({ team_url, project_url, component_id: openId }, loaded);
    } else {
      draft.close();
    }
  }, [draft, openId, loaded, team_url, project_url]);
  useEffect(() => () => draft.close(), [draft]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draft.unsaved()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);

  if (team.isError || project.isError) {
    // Also a project the account can't see, which the API won't tell apart
    notFound();
  }
  if (team.data === undefined || project.data === undefined) {
    return null;
  }
  const listed = components?.find((component) => component.id === openId);
  const empty = openId === undefined && components?.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        team={team.data}
        project={project.data}
        component={listed}
        renameNow={named !== undefined && named === listed?.id}
        onRenamed={() => setNamed(undefined)}
      />
      <div className="flex min-h-0 flex-1">
        <ComponentsPanel
          team={team.data}
          project={project.data}
          components={components}
          failed={list.isError}
          onRetry={() => void list.refetch()}
          openId={openId}
          onCreate={() => create.mutate({ path, body: {} })}
          creating={create.isPending}
        />
        <main className="relative min-w-0 flex-1 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[18px_18px]">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <p className="font-medium text-lg">No component open</p>
              <p className="text-muted-foreground text-sm">
                Create a component to start building.
              </p>
              <Button
                size="sm"
                className="mt-3"
                disabled={create.isPending}
                onClick={() => create.mutate({ path, body: {} })}
              >
                <Plus />
                New component
              </Button>
            </div>
          ) : null}
        </main>
        <Inspector />
      </div>
      <StatusBar draft={draft} />
    </div>
  );
}

/** A project's editor: the components, the open one's canvas, its Preview and properties. */
export function Editor() {
  return (
    <SignedIn>
      <Toasts>
        <EditorContent />
      </Toasts>
    </SignedIn>
  );
}
