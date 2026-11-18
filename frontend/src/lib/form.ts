import { type FormEvent, useCallback, useRef, useState } from "react";
import { TEAM_URL_MAX_LENGTH, TEAM_URL_PATTERN } from "./team-url";

export type Errors<T> = Partial<Record<keyof T | "root", string>>;

/** The few shared behaviors of our forms: validate, focus errors and prevent double submits. */
export function useFields<T extends Record<string, string>>(
  initial: T,
  validate: (values: T) => Errors<T>,
) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Errors<T>>({});
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const pending = useRef(false);

  function update(changes: Partial<T>) {
    const next = { ...values, ...changes };
    setValues(next);
    if (submitted.current) {
      setErrors((old) => {
        const updated = { ...old };
        const invalid = validate(next);
        for (const name of Object.keys(changes) as Array<keyof T>) {
          const error = invalid[name];
          if (error === undefined) delete updated[name];
          else updated[name] = error;
        }
        return updated;
      });
    }
  }

  function change<K extends keyof T>(name: K, value: T[K]) {
    const changes: Partial<T> = {};
    changes[name] = value;
    update(changes);
  }

  const reset = useCallback((next: T) => {
    setValues(next);
    setErrors({});
    submitted.current = false;
  }, []);

  async function submit(
    action: (values: T) => Promise<void>,
    event?: FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();
    if (pending.current) return;
    submitted.current = true;
    const invalid = validate(values);
    setErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first !== undefined) {
      const field = event?.currentTarget.elements.namedItem(first);
      if (field instanceof HTMLElement) field.focus();
      return;
    }
    pending.current = true;
    setSubmitting(true);
    try {
      await action(values);
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return {
    values,
    errors,
    submitting,
    change,
    update,
    reset,
    setErrors,
    submit,
  };
}

export function validateTeam(values: { name: string; url: string }) {
  const errors: Errors<typeof values> = {};
  if (!values.name.trim()) errors.name = "Enter a team name.";
  else if (values.name.trim().length > 100)
    errors.name = "Use at most 100 characters.";
  if (values.url.length < 3) errors.url = "Use at least 3 characters.";
  else if (values.url.length > TEAM_URL_MAX_LENGTH)
    errors.url = `Use at most ${TEAM_URL_MAX_LENGTH} characters.`;
  else if (!TEAM_URL_PATTERN.test(values.url))
    errors.url = "Use lowercase letters, numbers and single hyphens.";
  return errors;
}
