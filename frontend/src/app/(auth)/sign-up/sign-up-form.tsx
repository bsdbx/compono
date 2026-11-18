import { useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { signUp } from "@/api/client";
import { currentAccountQueryKey } from "@/api/queries";
import type { SignUp } from "@/api/types";
import { Field } from "@/components/field";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Errors, useFields } from "@/lib/form";
import { Link, useRouter, useSearchParams } from "@/lib/navigation";
import { safeNext } from "@/lib/team-url";

// The same validation and messages as the account API and the original form.
const EMAIL =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
function validate(values: SignUp): Errors<SignUp> {
  const errors: Errors<SignUp> = {};
  if (!values.name.trim()) errors.name = "Enter your name.";
  else if (values.name.trim().length > 100)
    errors.name = "Use at most 100 characters.";
  if (!EMAIL.test(values.email)) errors.email = "Enter a valid email address.";
  if (values.password.length < 8)
    errors.password = "Use at least 8 characters.";
  else if (values.password.length > 128)
    errors.password = "Use at most 128 characters.";
  return errors;
}

export function SignUpForm() {
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
  } = useFields({ name: "", email: "", password: "" }, validate);

  async function submit(values: SignUp) {
    try {
      const { data, error } = await signUp({
        body: { ...values, name: values.name.trim() },
      });
      if (data !== undefined) {
        queryClient.setQueryData(currentAccountQueryKey(), data);
        router.replace(safeNext(next));
        return;
      }
      if (error?.detail === "email_taken") {
        setErrors({ email: "taken" });
        return;
      }
    } catch {
      // The request didn't reach the API
    }
    setErrors({ root: "Couldn’t create your account. Try again in a moment." });
  }

  const emailError =
    errors.email === "taken" ? (
      <>
        An account with this email already exists.{" "}
        <Link href="/sign-in" className="font-medium text-foreground">
          Sign in
        </Link>
      </>
    ) : (
      errors.email
    );

  return (
    <form
      // Before the page is interactive, a submit posts rather than putting the password in the URL
      method="post"
      noValidate
      onSubmit={(event) => void send(submit, event)}
      className="flex flex-col gap-4"
    >
      <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
        <Input
          id={`${id}-name`}
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={errors.name !== undefined}
          name="name"
          value={values.name}
          onChange={(event) => change("name", event.target.value)}
        />
      </Field>
      <Field label="Work email" htmlFor={`${id}-email`} error={emailError}>
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
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
        Create account
      </Button>
    </form>
  );
}
