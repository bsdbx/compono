import { Suspense } from "react";
import { Link } from "@/lib/navigation";
import { SignInForm } from "./sign-in-form";
import { SignedOutNotice } from "./signed-out-notice";

export default function SignInPage() {
  return (
    <>
      <h1 className="font-semibold text-2xl tracking-[-0.01em]">
        Welcome back
      </h1>
      <p className="mt-1.5 text-base text-muted-foreground">
        Sign in to keep building.
      </p>
      <Suspense>
        <SignedOutNotice />
      </Suspense>
      <div className="mt-8">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-base text-muted-foreground">
        New here?{" "}
        <Link href="/sign-up" className="font-medium text-foreground">
          Create an account
        </Link>
      </p>
    </>
  );
}
