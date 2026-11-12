"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BenchmarkNode as BenchmarkNodeView,
  SimpleWhenZoomedOut,
} from "./benchmark-node";
import { frames, measure, refreshRate, SLOW_FRAME_MS } from "./frames";
import { type BenchmarkNode, benchmarkGraph, SIMPLE_BELOW_ZOOM } from "./graph";
import { markdown, measured, percent, type Report } from "./report";
import { run, SCENARIOS } from "./scenarios";

const NODE_TYPES = { benchmark: BenchmarkNodeView };

// ADR 0001 asks for 60 fps with 200 nodes and smooth navigation with 300, degrading to about 30 fps at 400
const COUNTS = [200, 300, 400];

type State =
  | { status: "ready" }
  | { status: "running"; scenario: string }
  | { status: "done"; report: Report }
  | { status: "failed"; error: string };

/** The GPU's name, which Chrome gives and other browsers may hide. */
function gpu(): string {
  const gl = document.createElement("canvas").getContext("webgl");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  if (gl == null || info == null) {
    return "an unknown GPU";
  }
  return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
}

function environment(): string {
  return [
    navigator.userAgent,
    gpu(),
    `${navigator.hardwareConcurrency} CPU threads`,
    `a ${innerWidth}×${innerHeight} window at ${devicePixelRatio}×`,
  ].join("; ");
}

function Benchmark() {
  const flow = useReactFlow<BenchmarkNode>();
  const canvas = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState(() => benchmarkGraph(200));
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [simple, setSimple] = useState(false);
  const [state, setState] = useState<State>({ status: "ready" });
  const running = state.status === "running";

  function choose(count: number) {
    const next = benchmarkGraph(count);
    setGraph(next);
    setNodes(next.nodes);
    setState({ status: "ready" });
  }

  async function start() {
    const root = canvas.current;
    if (root === null) {
      return;
    }
    try {
      setState({ status: "running", scenario: "Starting" });
      // Each run starts from the same graph, with nothing selected
      setNodes(graph.nodes);
      await frames(2);
      const hz = refreshRate(await measure(1000, () => {}));

      const results = [];
      for (const scenario of SCENARIOS) {
        setState({ status: "running", scenario: scenario.name });
        await frames(2);
        const summary = await run(scenario, flow, graph, root);
        results.push({ name: scenario.name, summary });
      }

      setState({
        status: "done",
        report: {
          date: new Date().toISOString().slice(0, 10),
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          simple,
          hz,
          results,
          environment: environment(),
        },
      });
    } catch (error) {
      setState({ status: "failed", error: String(error) });
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-[#09090b] text-sm text-zinc-300">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-zinc-800 border-b px-4 py-2">
        <h1 className="font-medium text-zinc-50">Canvas benchmark</h1>
        <fieldset className="flex gap-1" disabled={running}>
          <legend className="sr-only">Nodes</legend>
          {COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={graph.nodes.length === count}
              onClick={() => choose(count)}
              className={cn(
                "rounded-md px-2 py-1 disabled:opacity-50",
                graph.nodes.length === count
                  ? "bg-zinc-800 text-zinc-50"
                  : "hover:bg-zinc-900",
              )}
            >
              {count} nodes
            </button>
          ))}
        </fieldset>
        <span className="text-zinc-500">{graph.edges.length} wires</span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={simple}
            disabled={running}
            onChange={(event) => {
              setSimple(event.target.checked);
              setState({ status: "ready" });
            }}
          />
          Simple nodes below {SIMPLE_BELOW_ZOOM * 100}% zoom
        </label>
        <button
          type="button"
          disabled={running}
          onClick={() => {
            void start();
          }}
          className="rounded-md bg-zinc-50 px-3 py-1 font-medium text-zinc-950 disabled:opacity-50"
        >
          Run
        </button>
        <p role="status" className="text-zinc-400">
          {state.status === "ready" &&
            `Runs ${SCENARIOS.length} scenarios for about ${SCENARIOS.length * 5} seconds. Keep the mouse still and the tab open.`}
          {state.status === "running" && `${state.scenario}…`}
          {state.status === "failed" && state.error}
        </p>
        {process.env.NODE_ENV !== "production" && (
          <p className="text-amber-400">
            This is a development build, which is several times slower. Run it
            with pnpm build and pnpm start.
          </p>
        )}
      </header>
      {state.status === "done" && <Results report={state.report} />}
      <div ref={canvas} className="min-h-0 flex-1">
        <SimpleWhenZoomedOut value={simple}>
          <ReactFlow
            nodes={nodes}
            edges={graph.edges}
            onNodesChange={onNodesChange}
            nodeTypes={NODE_TYPES}
            colorMode="dark"
            minZoom={0.05}
            fitView
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              bgColor="#09090b"
              color="#27272a"
            />
          </ReactFlow>
        </SimpleWhenZoomedOut>
      </div>
    </main>
  );
}

function Results({ report }: { report: Report }) {
  return (
    <section
      aria-label="Results"
      className="flex flex-wrap items-start gap-4 border-zinc-800 border-b px-4 py-3"
    >
      <table className="text-left">
        <caption className="pb-2 text-left text-zinc-400">
          {measured(report)}, on a {report.hz} Hz screen
        </caption>
        <thead className="text-zinc-500">
          <tr>
            <th className="pr-6 font-normal">Scenario</th>
            <th className="pr-6 font-normal">Average fps</th>
            <th className="pr-6 font-normal">Frames over {SLOW_FRAME_MS} ms</th>
            <th className="pr-6 font-normal">Longest frame</th>
            <th className="font-normal">Holds 60 fps</th>
          </tr>
        </thead>
        <tbody className="text-zinc-50">
          {report.results.map(({ name, summary }) => (
            <tr key={name}>
              <td className="pr-6">{name}</td>
              <td className="pr-6">{Math.round(summary.fps)}</td>
              <td className="pr-6">{percent(summary.slowShare)}</td>
              <td className="pr-6">{Math.round(summary.longestMs)} ms</td>
              <td>{summary.holds60 ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(markdown(report));
        }}
        className="rounded-md bg-zinc-800 px-3 py-1 text-zinc-50"
      >
        Copy as Markdown
      </button>
    </section>
  );
}

/** Measures how smoothly React Flow pans, zooms and drags a graph of hundreds of nodes. */
export function CanvasBenchmark() {
  return (
    <ReactFlowProvider>
      <Benchmark />
    </ReactFlowProvider>
  );
}
