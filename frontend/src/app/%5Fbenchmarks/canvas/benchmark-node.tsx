import {
  Handle,
  type NodeProps,
  Position,
  type ReactFlowState,
  useStore,
} from "@xyflow/react";
import { createContext, memo, use } from "react";
import { cn } from "@/lib/utils";
import {
  type BenchmarkNode as BenchmarkNodeType,
  handleId,
  type Row,
  SIMPLE_BELOW_ZOOM,
  SOCKET_COLOR,
} from "./graph";

/** Whether nodes leave out their text and inputs below SIMPLE_BELOW_ZOOM. */
export const SimpleWhenZoomedOut = createContext(false);

const TAGS = ["div", "span", "h3", "p", "a", "button"];

const HANDLE = "size-2.5! min-h-0! min-w-0! border-0!";

// A node renders again only when the zoom crosses SIMPLE_BELOW_ZOOM
const zoomedOut = (state: ReactFlowState) =>
  state.transform[2] < SIMPLE_BELOW_ZOOM;

function Content({ row }: { row: Exclude<Row, { type: "output" }> }) {
  switch (row.type) {
    case "input":
      return <span className="whitespace-pre">{row.label}</span>;
    case "field":
      return (
        <label className="nodrag flex h-6 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-2">
          <span className="text-zinc-500">{row.label}</span>
          <input
            defaultValue={row.value}
            className="w-16 bg-transparent text-right text-zinc-50 outline-none"
          />
        </label>
      );
    case "select":
      return (
        <select
          aria-label="Tag"
          defaultValue={row.value}
          className="nodrag h-6 w-full rounded-md border border-zinc-800 bg-zinc-900 px-1.5 text-zinc-50"
        >
          {TAGS.map((tag) => (
            <option key={tag}>{tag}</option>
          ))}
        </select>
      );
  }
}

/** A row with its socket. A simple row keeps its size and socket, so wires stay where they are. */
function NodeRow({
  row,
  id,
  simple,
}: {
  row: Row;
  id: string;
  simple: boolean;
}) {
  const color = { background: SOCKET_COLOR[row.kind] };
  if (row.type === "output") {
    return (
      <div className="relative flex h-7 items-center justify-end px-3 text-zinc-400">
        {!simple && row.label}
        <Handle
          type="source"
          position={Position.Right}
          id={id}
          className={HANDLE}
          style={color}
        />
      </div>
    );
  }
  return (
    <div className="relative flex h-7 items-center px-3 text-zinc-300">
      <Handle
        type="target"
        position={Position.Left}
        id={id}
        className={HANDLE}
        style={color}
      />
      {!simple && <Content row={row} />}
    </div>
  );
}

/** A node like the editor's, with a socket on every row. */
export const BenchmarkNode = memo(function BenchmarkNode({
  data,
  selected,
}: NodeProps<BenchmarkNodeType>) {
  const isZoomedOut = useStore(zoomedOut);
  const simple = use(SimpleWhenZoomedOut) && isZoomedOut;
  return (
    <div
      className={cn(
        "w-[190px] rounded-lg border bg-[#111114] text-[13px]",
        selected ? "border-[#8b93f0]" : "border-zinc-800",
      )}
    >
      <div className="flex h-8 items-center border-[#1f1f23] border-b px-3 font-medium text-zinc-50">
        {!simple && data.title}
      </div>
      <div className="py-1.5">
        {data.rows.map((row, index) => {
          const id = handleId(row, index);
          return <NodeRow key={id} row={row} id={id} simple={simple} />;
        })}
      </div>
    </div>
  );
});
