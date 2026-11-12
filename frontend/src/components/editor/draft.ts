import type { QueryClient } from "@tanstack/react-query";
import { componentQueryKey } from "@/api/@tanstack/react-query.gen";
import { component as loadComponent, saveComponent } from "@/api/sdk.gen";
import type { Component, ScreenSize } from "@/api/types.gen";

/** How long the draft waits after a change before saving, so that typing saves once. */
export const SAVE_DELAY = 1000;

/** What a save stores: the graph and the screen sizes. */
export type Content = {
  graph: Component["graph"];
  screen_sizes: ScreenSize[];
};

/**
 * - saved: nothing waits to be saved
 * - saving: a change waits for the delay, or is on its way
 * - failed: the last save didn't reach the API, and Retry sends it again
 * - conflict: someone else saved first, and Reload loads their version
 */
export type SaveStatus = "saved" | "saving" | "failed" | "conflict";

export type ComponentPath = {
  team_url: string;
  project_url: string;
  component_id: string;
};

type Snapshot = { status: SaveStatus; content: Content | undefined };

type Open = {
  path: ComponentPath;
  version: number;
  // Changed, and not sent yet
  pending: Content | undefined;
  sending: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

/**
 * The open component's content, saved a moment after each change.
 * A save sends the version it started from, so it never overwrites someone else's save.
 */
export class Draft {
  #queryClient: QueryClient;
  #open: Open | undefined;
  #snapshot: Snapshot = { status: "saved", content: undefined };
  #listeners = new Set<() => void>();

  constructor(queryClient: QueryClient) {
    this.#queryClient = queryClient;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.#snapshot;

  #set(changes: Partial<Snapshot>) {
    this.#snapshot = { ...this.#snapshot, ...changes };
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Starts editing a component, after sending what the last one hadn't saved yet. */
  open(path: ComponentPath, component: Component) {
    if (this.#open?.path.component_id === component.id) {
      return;
    }
    this.close();
    this.#open = {
      path,
      version: component.version,
      pending: undefined,
      sending: false,
      timer: undefined,
    };
    this.#set({
      status: "saved",
      content: { graph: component.graph, screen_sizes: component.screen_sizes },
    });
  }

  /** Stops editing, sending what isn't saved yet without waiting for it. */
  close() {
    const open = this.#open;
    if (open === undefined) {
      return;
    }
    clearTimeout(open.timer);
    if (open.pending !== undefined && !open.sending) {
      void saveComponent({
        path: open.path,
        body: { version: open.version, ...open.pending },
      }).catch(() => {});
    }
    this.#open = undefined;
    this.#set({ status: "saved", content: undefined });
  }

  /** Changes the content, and saves it once the changes stop for a moment. */
  change(content: Content) {
    const open = this.#open;
    if (open === undefined) {
      return;
    }
    open.pending = content;
    // Saving again would only conflict again, until Reload
    if (this.#snapshot.status === "conflict") {
      this.#set({ content });
      return;
    }
    clearTimeout(open.timer);
    open.timer = setTimeout(() => void this.#send(open), SAVE_DELAY);
    this.#set({ status: "saving", content });
  }

  /** Sends what failed to save again, now. */
  retry() {
    const open = this.#open;
    if (open !== undefined && this.#snapshot.status === "failed") {
      void this.#send(open);
    }
  }

  /** Drops the changes and loads the version someone else saved. */
  async reload() {
    const open = this.#open;
    if (open === undefined) {
      return;
    }
    clearTimeout(open.timer);
    open.pending = undefined;
    const { data } = await loadComponent({ path: open.path });
    if (data === undefined || this.#open !== open) {
      return;
    }
    open.version = data.version;
    this.#queryClient.setQueryData(
      componentQueryKey({ path: open.path }),
      data,
    );
    this.#set({
      status: "saved",
      content: { graph: data.graph, screen_sizes: data.screen_sizes },
    });
  }

  /** Whether leaving now would lose changes. */
  unsaved(): boolean {
    return this.#snapshot.status !== "saved";
  }

  async #send(open: Open) {
    clearTimeout(open.timer);
    const content = open.pending;
    if (open.sending || content === undefined) {
      return;
    }
    open.pending = undefined;
    open.sending = true;
    this.#set({ status: "saving" });

    let status: SaveStatus = "saved";
    try {
      const { data, error } = await saveComponent({
        path: open.path,
        body: { version: open.version, ...content },
      });
      if (data !== undefined) {
        open.version = data.version;
        this.#queryClient.setQueryData<Component>(
          componentQueryKey({ path: open.path }),
          (old) =>
            old && {
              ...old,
              ...content,
              version: data.version,
              updated_at: data.updated_at,
            },
        );
      } else {
        status = error?.detail === "version_conflict" ? "conflict" : "failed";
      }
    } catch {
      status = "failed";
    }
    open.sending = false;
    if (this.#open !== open) {
      return;
    }
    if (status !== "saved") {
      // Newer changes, if any, are sent instead on Retry
      open.pending ??= content;
      clearTimeout(open.timer);
      this.#set({ status });
      return;
    }
    // Changes made while this save was on its way
    if (open.pending !== undefined) {
      void this.#send(open);
      return;
    }
    this.#set({ status: "saved" });
  }
}
