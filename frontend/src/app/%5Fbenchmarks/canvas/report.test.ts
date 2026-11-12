import { expect, test } from "vitest";
import { markdown, type Report } from "./report";

const REPORT: Report = {
  date: "2026-11-12",
  nodes: 200,
  edges: 340,
  simple: false,
  hz: 60,
  results: [
    {
      name: "Pan",
      summary: { fps: 59.94, slowShare: 0, longestMs: 17.2, holds60: true },
    },
    {
      name: "Drag",
      summary: {
        fps: 41.5,
        slowShare: 0.1234,
        longestMs: 66.6,
        holds60: false,
      },
    },
  ],
  environment: "Chrome; a GPU; 24 CPU threads",
};

test("the report as Markdown", () => {
  expect(
    markdown(REPORT),
  ).toBe(`200 nodes and 340 wires, drawn in full at every zoom, measured on 2026-11-12 on a 60 Hz screen.

| Scenario | Average fps | Frames over 20 ms | Longest frame | Holds 60 fps |
| --- | --- | --- | --- | --- |
| Pan | 60 | 0.0% | 17 ms | Yes |
| Drag | 42 | 12.3% | 67 ms | No |

Chrome; a GPU; 24 CPU threads
`);
});

test("the report says when nodes were simple", () => {
  expect(markdown({ ...REPORT, simple: true })).toMatch(
    /^200 nodes and 340 wires, simple below 50% zoom, measured on/,
  );
});
