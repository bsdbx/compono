"use client";

import { useQuery } from "@tanstack/react-query";
import { healthOptions } from "@/api/@tanstack/react-query.gen";

/** Whether the backend answers, through the generated API client. */
export function ApiStatus() {
  const { data, isError } = useQuery(healthOptions());
  if (isError) {
    return <p className="text-destructive text-sm">The API is unreachable.</p>;
  }
  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">Checking the API…</p>;
  }
  return <p className="text-muted-foreground text-sm">API: {data.status}</p>;
}
