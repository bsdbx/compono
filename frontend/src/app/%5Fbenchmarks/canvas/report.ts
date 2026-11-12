import { type FrameSummary, SLOW_FRAME_MS } from "./frames";
import { SIMPLE_BELOW_ZOOM } from "./graph";

export type Report = {
  /** Like 2026-11-12 */
  date: string;
  nodes: number;
  edges: number;
  /** Whether nodes left out their text and inputs below SIMPLE_BELOW_ZOOM */
  simple: boolean;
  /** The screen's refresh rate */
  hz: number;
  results: { name: string; summary: FrameSummary }[];
  /** The browser, GPU, CPU threads and window size */
  environment: string;
};

export function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** What the run measured, like "200 nodes and 340 wires, drawn in full at every zoom". */
export function measured(report: Report): string {
  const nodes = report.simple
    ? `simple below ${SIMPLE_BELOW_ZOOM * 100}% zoom`
    : "drawn in full at every zoom";
  return `${report.nodes} nodes and ${report.edges} wires, ${nodes}`;
}

/** The report as Markdown, to record in docs/BENCHMARKS.md. */
export function markdown(report: Report): string {
  const rows = report.results.map(
    ({ name, summary }) =>
      `| ${name} | ${Math.round(summary.fps)} | ${percent(summary.slowShare)} | ${Math.round(summary.longestMs)} ms | ${summary.holds60 ? "Yes" : "No"} |`,
  );
  return [
    `${measured(report)}, measured on ${report.date} on a ${report.hz} Hz screen.`,
    "",
    `| Scenario | Average fps | Frames over ${SLOW_FRAME_MS} ms | Longest frame | Holds 60 fps |`,
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    report.environment,
    "",
  ].join("\n");
}
