import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { signIn } from "@/api/client";
import { currentAccountQueryKey } from "@/api/queries";
import type { SignIn } from "@/api/types";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Errors, useFields } from "@/lib/form";
import { useRouter, useSearchParams } from "@/lib/navigation";
import { safeNext } from "@/lib/team-url";

function validate(values: SignIn): Errors<SignIn> {
  return {
    ...(!values.email.trim() ? { email: "Enter your email." } : {}),
    ...(!values.password ? { password: "Enter your password." } : {}),
  };
}

export function SignInForm() {
  // Ids of this form's own, as a page can keep another form with the same fields
  const id = useId();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const queryClient = useQueryClient();
  const {
    values,
    errors,
    submitting: isSubmitting,
    change,
    setErrors,
    submit: send,
  } = useFields({ email: "", password: "" }, validate);

  async function submit(values: SignIn) {
    try {
      const { data, error } = await signIn({
        body: { ...values, email: values.email.trim() },
      });
      if (data !== undefined) {
        queryClient.setQueryData(currentAccountQueryKey(), data);
        router.replace(safeNext(next));
        return;
      }
      if (error?.detail === "wrong_email_or_password") {
        // Both fields show as wrong, with one message under them
        setErrors({ email: "", password: "Email or password is incorrect." });
        return;
      }
    } catch {
      // The request didn't reach the API
    }
    setErrors({ root: "Couldn’t sign in. Try again in a moment." });
  }

  return (
    <form
      // Before the page is interactive, a submit posts rather than putting the password in the URL
      method="post"
      noValidate
      onSubmit={(event) => void send(submit, event)}
      className="flex flex-col gap-4"
    >
      <Field label="Email" htmlFor={`${id}-email`} error={errors.email}>
        <Input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={errors.email !== undefined}
          name="email"
          value={values.email}
          onChange={(event) => change("email", event.target.value)}
        />
      </Field>
      <Field
        label="Password"
        htmlFor={`${id}-password`}
        error={errors.password}
      >
        <PasswordInput
          id={`${id}-password`}
          autoComplete="current-password"
          placeholder="Your password"
          aria-invalid={errors.password !== undefined}
          name="password"
          value={values.password}
          onChange={(event) => change("password", event.target.value)}
        />
      </Field>
      {errors.root ? (
        <p role="alert" className="text-error text-sm">
          {errors.root}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting} className="mt-2">
        Sign in
      </Button>
    </form>
  );
}
