import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { LayersArt } from "./layers-art";
import { RedirectIfSignedIn } from "./redirect-if-signed-in";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1">
      <RedirectIfSignedIn />
      <div className="relative flex basis-[44%] items-center justify-center px-6 py-16">
        <div className="absolute top-7 left-8">
          <Logo />
        </div>
        <main className="w-full max-w-86">{children}</main>
      </div>
      <div className="flex flex-1 p-3">
        <div className="flex flex-1 items-center justify-center rounded-[14px] border border-border">
          <LayersArt />
        </div>
      </div>
    </div>
  );
}
