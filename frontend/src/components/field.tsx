import type { ReactNode } from "react";

/** A labelled form field, with its error under it. */
export function Field({
  label,
  htmlFor,
  aside,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Next to the label, like a link */
  aside?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="font-medium text-sm">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? <p className="text-error text-sm">{error}</p> : null}
    </div>
  );
}
