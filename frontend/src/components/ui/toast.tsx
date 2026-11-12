"use client";

import { Toast as Primitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
} from "react";

export type ToastMessage = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
};

type Shown = ToastMessage & { id: number };

const ShowToast = createContext<((toast: ToastMessage) => void) | null>(null);

/** Shows a short message in the bottom right corner, which goes away by itself. */
export function useToast(): (toast: ToastMessage) => void {
  const show = use(ShowToast);
  if (show === null) {
    throw new Error("useToast needs a Toasts around it.");
  }
  return show;
}

let lastId = 0;

/** Where the toasts of its children show. */
export function Toasts({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const show = useCallback((toast: ToastMessage) => {
    lastId += 1;
    const id = lastId;
    setShown((all) => [...all, { ...toast, id }]);
  }, []);
  const forget = (id: number) =>
    setShown((all) => all.filter((toast) => toast.id !== id));

  return (
    <ShowToast value={show}>
      <Primitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {shown.map((toast) => (
          <Primitive.Root
            key={toast.id}
            onOpenChange={(open) => {
              if (!open) {
                forget(toast.id);
              }
            }}
            className="flex items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3.5 shadow-2xl data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-2"
          >
            {toast.icon ? (
              <span className="mt-0.5 flex shrink-0 self-start [&_svg]:size-4">
                {toast.icon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <Primitive.Title className="font-medium text-base">
                {toast.title}
              </Primitive.Title>
              {toast.description ? (
                <Primitive.Description className="text-muted-foreground text-sm">
                  {toast.description}
                </Primitive.Description>
              ) : null}
            </div>
            {toast.action ? (
              <Primitive.Action altText={toast.action.label} asChild>
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="h-6.5 shrink-0 rounded-md bg-foreground px-2.5 font-medium text-background text-sm"
                >
                  {toast.action.label}
                </button>
              </Primitive.Action>
            ) : null}
          </Primitive.Root>
        ))}
        <Primitive.Viewport className="fixed right-6 bottom-12 z-50 flex w-89 flex-col gap-2 outline-none" />
      </Primitive.Provider>
    </ShowToast>
  );
}
