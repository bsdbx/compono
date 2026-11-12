import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** A page with the logo in its corner and a short message in the middle, like the error page. */
export function CenteredPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12">
      <div className="absolute top-7 left-8">
        <Logo />
      </div>
      <main className="w-full max-w-95">
        <h1 className="font-semibold text-2xl tracking-[-0.01em]">{title}</h1>
        <p className="mt-2 text-base text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col gap-2">{children}</div>
      </main>
    </div>
  );
}
