import { Handle, Position } from "@xyflow/react";
import { WIRE_COLOR } from "./accepts";
import type { SocketType } from "./graph";
import { flowHandle } from "./wiring";

/** Compact type-colored sockets with a larger transparent target around the visible mark. */
export function SocketHandle({
  type,
  id,
  socket,
  side,
  offset = 0,
  top,
  label,
  pill = false,
  height,
  invisible = false,
}: {
  type: "source" | "target";
  id: string;
  socket: SocketType | undefined;
  side: "left" | "right";
  offset?: number;
  top?: number;
  label?: string;
  pill?: boolean;
  height?: number;
  invisible?: boolean;
}) {
  const kind = socket?.kind ?? "any";
  const color = WIRE_COLOR[kind];
  return (
    <Handle
      type={type}
      id={flowHandle(type, id)}
      title={label}
      position={side === "left" ? Position.Left : Position.Right}
      style={{
        ...(side === "left" ? { left: offset } : { right: offset }),
        ...(top === undefined ? {} : { top }),
        height: 1,
      }}
      className="z-10! size-px! min-h-0! min-w-0! border-0! bg-transparent!"
    >
      <span
        aria-hidden
        className="pointer-events-auto absolute left-1/2 top-1/2 flex w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        style={{ height: height ?? 20 }}
      >
        <span
          data-socket-kind={kind}
          className="pointer-events-none block shrink-0 rounded-full"
          style={{
            width: pill ? 8 : 10,
            height:
              height === undefined
                ? pill
                  ? 14
                  : 10
                : Math.max(14, height - 6),
            opacity: invisible ? 0 : 1,
            ...(pill || kind === "slot" || kind === "any"
              ? { background: "var(--card)", border: `1.5px solid ${color}` }
              : { background: color }),
          }}
        />
      </span>
    </Handle>
  );
}
