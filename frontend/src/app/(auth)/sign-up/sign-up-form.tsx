"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { currentAccountQueryKey } from "@/api/@tanstack/react-query.gen";
import { signUp } from "@/api/sdk.gen";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/team-url";

// The same limits as the API's
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(100, "Use at most 100 characters."),
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use at most 128 characters."),
});

type Values = z.infer<typeof schema>;

export function SignUpForm() {
  // Ids of this form's own, as a page can keep another form with the same fields
  const id = useId();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function submit(values: Values) {
    try {
      const { data, error } = await signUp({ body: values });
      if (data !== undefined) {
        queryClient.setQueryData(currentAccountQueryKey(), data);
        router.replace(safeNext(next));
        return;
      }
      if (error?.detail === "email_taken") {
        setError("email", { type: "taken", message: "" });
        return;
      }
    } catch {
      // The request didn't reach the API
    }
    setError("root", {
      message: "Couldn’t create your account. Try again in a moment.",
    });
  }

  const emailError =
    errors.email?.type === "taken" ? (
      <>
        An account with this email already exists.{" "}
        <Link href="/sign-in" className="font-medium text-foreground">
          Sign in
        </Link>
      </>
    ) : (
      errors.email?.message
    );

  return (
    <form
      // Before the page is interactive, a submit posts rather than putting the password in the URL
      method="post"
      noValidate
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-4"
    >
      <Field label="Name" htmlFor={`${id}-name`} error={errors.name?.message}>
        <Input
          id={`${id}-name`}
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={errors.name !== undefined}
          {...register("name")}
        />
      </Field>
      <Field label="Work email" htmlFor={`${id}-email`} error={emailError}>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={errors.email !== undefined}
          {...register("email")}
        />
      </Field>
      <Field
        label="Password"
        htmlFor={`${id}-password`}
        error={errors.password?.message}
      >
        <PasswordInput
          id={`${id}-password`}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-invalid={errors.password !== undefined}
          {...register("password")}
        />
      </Field>
      {errors.root ? (
        <p role="alert" className="text-error text-sm">
          {errors.root.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2">
        Create account
      </Button>
    </form>
  );
}
