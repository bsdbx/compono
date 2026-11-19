import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { evaluateGraph, generateCode } from "@/api/client";
import { listNodeTypesOptions } from "@/api/queries";
import type { Evaluated, GeneratedCode, NodeTypeInfo } from "@/api/types";
import type { Graph } from "./graph";

/** Every node type, by type. They don't change while the app runs. */
export function useNodeTypes(): ReadonlyMap<string, NodeTypeInfo> | undefined {
  const { data } = useQuery({ ...listNodeTypesOptions(), staleTime: Infinity });
  return useMemo(
    () =>
      data === undefined
        ? undefined
        : new Map(data.map((nodeType) => [nodeType.type, nodeType])),
    [data],
  );
}

/** How long a graph has to stay the same before it's evaluated, so that typing asks once. */
export const EVALUATE_DELAY = 120;

/** Display labels and layout do not change the graph's evaluation or generated code. */
function meaning(graph: Graph) {
  return {
    ...graph,
    nodes: graph.nodes.map(
      ({ position: _, name: _name, width: _width, ...node }) => node,
    ),
  };
}

function useSettled<T>(value: T, delay: number): T {
  const key = JSON.stringify(value);
  const [settled, setSettled] = useState({ key, value });
  useEffect(() => {
    if (key === settled.key) {
      return;
    }
    const timer = setTimeout(() => setSettled({ key, value }), delay);
    return () => clearTimeout(timer);
  }, [key, value, delay, settled.key]);
  return settled.value;
}

/** The API's evaluation of the graph, again whenever what it depends on changes. Moving nodes doesn't. */
export function useEvaluation(graph: Graph | undefined): Evaluated | undefined {
  const settled = useSettled(graph && meaning(graph), EVALUATE_DELAY);
  const { data } = useQuery({
    queryKey: ["evaluate", settled],
    queryFn: async () => {
      const { data } = await evaluateGraph({
        body: settled as unknown as Graph,
        throwOnError: true,
      });
      return data;
    },
    enabled: settled !== undefined,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  return data;
}

/** The component as a JSX file, from the API, again whenever its name or what its graph means changes. */
export function useGeneratedCode(
  graph: Graph | undefined,
  name: string,
): GeneratedCode | undefined {
  const settled = useSettled(graph && meaning(graph), EVALUATE_DELAY);
  const { data } = useQuery({
    queryKey: ["code", name, settled],
    queryFn: async () => {
      const { data } = await generateCode({
        body: { name, graph: settled as unknown as Graph },
        throwOnError: true,
      });
      return data;
    },
    enabled: settled !== undefined,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  return data;
}
