import { Suspense } from "react";
import { Link } from "@/lib/navigation";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-semibold text-2xl tracking-[-0.01em]">
        Create your account
      </h1>
      <p className="mt-1.5 text-base text-muted-foreground">
        Start building components in minutes.
      </p>
      <div className="mt-8">
        <Suspense>
          <SignUpForm />
        </Suspense>
      </div>
      <p className="mt-6 text-center text-base text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-foreground">
          Sign in
        </Link>
      </p>
    </>
  );
}
