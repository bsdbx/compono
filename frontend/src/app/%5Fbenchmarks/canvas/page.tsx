import type { Metadata } from "next";
import { CanvasBenchmark } from "./canvas-benchmark";

export const metadata: Metadata = {
  title: "Canvas benchmark · Compono",
  robots: { index: false },
};

export default function CanvasBenchmarkPage() {
  return <CanvasBenchmark />;
}
