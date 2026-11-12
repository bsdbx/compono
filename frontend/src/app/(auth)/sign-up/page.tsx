import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account · Compono" };

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
        <SignUpForm />
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
