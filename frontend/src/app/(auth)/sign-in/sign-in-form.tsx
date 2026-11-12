"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { currentAccountQueryKey } from "@/api/@tanstack/react-query.gen";
import { signIn } from "@/api/sdk.gen";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeNext } from "@/lib/team-url";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

type Values = z.infer<typeof schema>;

export function SignInForm() {
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
    defaultValues: { email: "", password: "" },
  });

  async function submit(values: Values) {
    try {
      const { data, error } = await signIn({ body: values });
      if (data !== undefined) {
        queryClient.setQueryData(currentAccountQueryKey(), data);
        router.replace(safeNext(next));
        return;
      }
      if (error?.detail === "wrong_email_or_password") {
        // Both fields show as wrong, with one message under them
        setError("email", { type: "wrong", message: "" });
        setError("password", {
          type: "wrong",
          message: "Email or password is incorrect.",
        });
        return;
      }
    } catch {
      // The request didn't reach the API
    }
    setError("root", { message: "Couldn’t sign in. Try again in a moment." });
  }

  return (
    <form
      // Before the page is interactive, a submit posts rather than putting the password in the URL
      method="post"
      noValidate
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-4"
    >
      <Field
        label="Email"
        htmlFor={`${id}-email`}
        error={errors.email?.message}
      >
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
          autoComplete="current-password"
          placeholder="Your password"
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
        Sign in
      </Button>
    </form>
  );
}
