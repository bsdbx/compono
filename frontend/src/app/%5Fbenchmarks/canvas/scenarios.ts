import type { Edge, ReactFlowInstance, XYPosition } from "@xyflow/react";
import { type FrameSummary, frames, measure, summarize } from "./frames";
import { type BenchmarkGraph, type BenchmarkNode, nodeAt } from "./graph";

type Flow = ReactFlowInstance<BenchmarkNode, Edge>;

/** What a scenario does on each frame, and whether it moved the canvas. */
type Motion = {
  step: (progress: number) => void;
  stop: () => void;
  moved: () => boolean;
};

export type Scenario = {
  name: string;
  start: (
    flow: Flow,
    graph: BenchmarkGraph,
    canvas: HTMLElement,
  ) => Promise<Motion>;
};

export const DURATION_MS = 4000;

// How many circles a drag makes in DURATION_MS
const TURNS = 2;

// How much closer the zoom gets, from seeing every node
const ZOOM_IN = 8;

// React Flow zooms by 2 to the power of -0.002 for every pixel a wheel scrolls
const ZOOM_PER_PIXEL = 0.002;

/**
 * Sends the mouse events that a real mouse sends. React Flow, through d3, follows a drag
 * with listeners on the window, so moves and releases go to the document.
 */
function mouse(
  type: "mousedown" | "mousemove" | "mouseup",
  target: EventTarget,
  point: XYPosition,
) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: type === "mouseup" ? 0 : 1,
      clientX: point.x,
      clientY: point.y,
    }),
  );
}

/** A point on a circle that starts and ends at the start. */
function around(start: XYPosition, radius: number, progress: number) {
  const angle = progress * TURNS * 2 * Math.PI;
  return {
    x: start.x + radius * (Math.cos(angle) - 1),
    y: start.y + radius * Math.sin(angle),
  };
}

/** Presses on the target, then moves the mouse in circles. Watches what should follow. */
function drag(
  target: Element,
  from: XYPosition,
  radius: number,
  watched: () => XYPosition,
): Motion {
  const before = watched();
  let farthest = 0;
  let last = from;
  mouse("mousedown", target, from);
  return {
    step(progress) {
      last = around(from, radius, progress);
      mouse("mousemove", document, last);
      const now = watched();
      farthest = Math.max(
        farthest,
        Math.hypot(now.x - before.x, now.y - before.y),
      );
    },
    stop() {
      mouse("mouseup", document, last);
    },
    moved: () => farthest > radius,
  };
}

function element(canvas: HTMLElement, selector: string): HTMLElement {
  const found = canvas.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`The canvas has no ${selector}.`);
  }
  return found;
}

function centerOf(target: Element): XYPosition {
  const box = target.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function positionOf(flow: Flow, id: string): XYPosition {
  const node = flow.getInternalNode(id);
  if (node === undefined) {
    throw new Error(`The canvas has no node ${id}.`);
  }
  return node.internals.positionAbsolute;
}

/** Centers the view on a node, and presses the mouse on its title, as a person would to drag it. */
async function grab(flow: Flow, canvas: HTMLElement, id: string, zoom: number) {
  const node = flow.getInternalNode(id);
  if (node === undefined) {
    throw new Error(`The canvas has no node ${id}.`);
  }
  const { x, y } = node.internals.positionAbsolute;
  await flow.setCenter(
    x + (node.measured.width ?? 0) / 2,
    y + (node.measured.height ?? 0) / 2,
    { zoom },
  );
  await frames(2);

  const box = element(
    canvas,
    `.react-flow__node[data-id="${id}"]`,
  ).getBoundingClientRect();
  const title = { x: box.left + box.width / 2, y: box.top + 16 * zoom };
  const target = document.elementFromPoint(title.x, title.y);
  if (target?.closest(`[data-id="${id}"]`) == null) {
    throw new Error(`Node ${id} is covered.`);
  }
  return { target, title };
}

export const SCENARIOS: Scenario[] = [
  {
    name: "Pan with every node in view",
    async start(flow, _graph, canvas) {
      await flow.fitView();
      await frames(2);
      // Pressed on the pane itself, as nodes cover most of it
      const pane = element(canvas, ".react-flow__pane");
      return drag(pane, centerOf(pane), 150, () => flow.getViewport());
    },
  },
  {
    name: "Zoom in and out",
    async start(flow, _graph, canvas) {
      await flow.fitView();
      await frames(2);
      const pane = element(canvas, ".react-flow__pane");
      const center = centerOf(pane);
      const fit = flow.getZoom();
      let closest = fit;
      return {
        step(progress) {
          // In and out twice
          const wave = 1 - Math.abs(((progress * 4) % 2) - 1);
          const zoom = fit * ZOOM_IN ** wave;
          pane.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              view: window,
              deltaMode: WheelEvent.DOM_DELTA_PIXEL,
              deltaY: -Math.log2(zoom / flow.getZoom()) / ZOOM_PER_PIXEL,
              clientX: center.x,
              clientY: center.y,
            }),
          );
          closest = Math.max(closest, flow.getZoom());
        },
        stop() {},
        moved: () => closest > fit * (ZOOM_IN / 2),
      };
    },
  },
  {
    name: "Drag a node at 100%",
    async start(flow, graph, canvas) {
      const id = nodeAt(
        graph,
        Math.floor(graph.columns / 2),
        Math.floor(graph.rows / 2),
      );
      const { target, title } = await grab(flow, canvas, id, 1);
      return drag(target, title, 120, () => positionOf(flow, id));
    },
  },
  {
    name: "Drag 20 selected nodes at 50%",
    async start(flow, graph, canvas) {
      const column = Math.floor(graph.columns / 2);
      const row = Math.floor(graph.rows / 2);
      // 5 columns and 4 rows around the middle
      const selected = new Set<string>();
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 1; dy++) {
          selected.add(nodeAt(graph, column + dx, row + dy));
        }
      }
      flow.setNodes((nodes) =>
        nodes.map((node) => ({ ...node, selected: selected.has(node.id) })),
      );
      await frames(2);

      const { target, title } = await grab(
        flow,
        canvas,
        nodeAt(graph, column, row),
        0.5,
      );
      // A corner of the selection, to see that every selected node moves
      const corner = nodeAt(graph, column - 2, row - 2);
      return drag(target, title, 100, () => positionOf(flow, corner));
    },
  },
];

/** Runs the scenario for DURATION_MS, and summarizes its frames. */
export async function run(
  scenario: Scenario,
  flow: Flow,
  graph: BenchmarkGraph,
  canvas: HTMLElement,
): Promise<FrameSummary> {
  const motion = await scenario.start(flow, graph, canvas);
  const intervals = await measure(DURATION_MS, motion.step);
  motion.stop();
  if (!motion.moved()) {
    throw new Error(`${scenario.name} didn't move the canvas.`);
  }
  return summarize(intervals);
}
