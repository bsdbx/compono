import { SignedIn } from "@/components/account";
import { AccountMenu } from "@/components/account-menu";
import { ApiStatus } from "@/components/api-status";

// Until the projects page takes its place, the start page shows who is signed in
export default function Home() {
  return (
    <SignedIn>
      <div className="flex flex-1">
        <aside className="flex w-59 flex-col justify-end border-sidebar-border border-r bg-sidebar p-2">
          <AccountMenu />
        </aside>
        <main className="flex flex-1 flex-col items-center justify-center gap-2">
          <h1 className="font-semibold text-2xl">Compono</h1>
          <ApiStatus />
        </main>
      </div>
    </SignedIn>
  );
}
