"use client";

import { useMemo, useState } from "react";

import type { FrameworkId, PropagatedDecisionMap, PropagatedMapEdge } from "@/lib/types";

interface Props {
  map: PropagatedDecisionMap;
  onNodeSelect?: (frameworkId: FrameworkId) => void;
}

type RelationFilter = "all" | "consensus" | "conflict" | "related";

function pairKey(a: FrameworkId, b: FrameworkId): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function relationClass(type: PropagatedMapEdge["relationType"]): string {
  if (type === "consensus") {
    return "border-emerald-400/35 bg-emerald-500/15 text-emerald-100";
  }

  if (type === "conflict") {
    return "border-rose-400/35 bg-rose-500/15 text-rose-100";
  }

  return "border-slate-500/35 bg-slate-700/35 text-slate-200";
}

function relationLabel(type: PropagatedMapEdge["relationType"]): string {
  if (type === "consensus") {
    return "Consensus";
  }

  if (type === "conflict") {
    return "Conflict";
  }

  return "Related";
}

export function PropagatedGraph({ map, onNodeSelect }: Props) {
  const [filter, setFilter] = useState<RelationFilter>("all");
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);

  const nodeById = useMemo(() => {
    return new Map(map.nodes.map((node) => [node.id, node]));
  }, [map.nodes]);

  const shortlistedNodes = useMemo(() => {
    return [...map.nodes]
      .sort((a, b) => b.applicabilityScore * b.confidence - a.applicabilityScore * a.confidence)
      .slice(0, 12);
  }, [map.nodes]);

  const strongestEdgeByPair = useMemo(() => {
    const edgeMap = new Map<string, PropagatedMapEdge>();

    for (const edge of map.edges) {
      const key = pairKey(edge.source, edge.target);
      const current = edgeMap.get(key);
      if (!current || edge.weight > current.weight) {
        edgeMap.set(key, edge);
      }
    }

    return edgeMap;
  }, [map.edges]);

  const filteredEdges = useMemo(() => {
    const edgeList = [...strongestEdgeByPair.values()].filter((edge) =>
      filter === "all" ? true : edge.relationType === filter,
    );

    edgeList.sort((a, b) => b.weight - a.weight);
    return edgeList;
  }, [filter, strongestEdgeByPair]);

  const selectedEdge = useMemo(() => {
    if (filteredEdges.length === 0) {
      return null;
    }

    if (!selectedEdgeKey) {
      return filteredEdges[0];
    }

    return (
      filteredEdges.find((edge) => pairKey(edge.source, edge.target) === selectedEdgeKey) ??
      filteredEdges[0]
    );
  }, [filteredEdges, selectedEdgeKey]);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Framework Relationship Matrix</h3>
          <p className="text-xs text-slate-400">
            Readable alternative to the old force graph. Shows strongest pairwise relationships with
            rationale.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["all", "consensus", "conflict", "related"] as const).map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded-full border px-2.5 py-1 capitalize transition ${
                  active
                    ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                    : "border-slate-600 text-slate-300 hover:border-sky-400/40"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              Strongest Relationships
            </h4>
            <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
              {filteredEdges.slice(0, 14).map((edge) => {
                const key = pairKey(edge.source, edge.target);
                const sourceLabel = nodeById.get(edge.source)?.label ?? edge.source;
                const targetLabel = nodeById.get(edge.target)?.label ?? edge.target;
                const selected = selectedEdge && pairKey(selectedEdge.source, selectedEdge.target) === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedEdgeKey(key);
                      onNodeSelect?.(edge.source);
                    }}
                    className={`w-full rounded-lg border p-2 text-left text-xs transition ${
                      selected
                        ? "border-sky-400/45 bg-sky-500/10"
                        : "border-slate-700 bg-slate-950/60 hover:border-slate-500"
                    }`}
                  >
                    <p className="font-medium text-slate-100">
                      {sourceLabel} ↔ {targetLabel}
                    </p>
                    <p className="mt-1 text-slate-300">
                      {relationLabel(edge.relationType)} · strength {(edge.weight * 100).toFixed(1)}%
                    </p>
                  </button>
                );
              })}

              {filteredEdges.length === 0 ? (
                <p className="rounded-lg border border-slate-700 bg-slate-950/60 p-2 text-xs text-slate-400">
                  No relationships in this filter.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-xs">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
              Selected Relationship
            </h4>
            {selectedEdge ? (
              <div className="space-y-2 text-slate-200">
                <p>
                  <span className="font-semibold text-slate-100">Type:</span>{" "}
                  {relationLabel(selectedEdge.relationType)}
                </p>
                <p>
                  <span className="font-semibold text-slate-100">Strength:</span>{" "}
                  {(selectedEdge.weight * 100).toFixed(1)}%
                </p>
                <p className="text-slate-300">{selectedEdge.rationale}</p>
              </div>
            ) : (
              <p className="text-slate-400">Select a relationship to inspect details.</p>
            )}
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-slate-700 bg-slate-900/70">
          <table className="min-w-[920px] border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 border-b border-r border-slate-700 bg-slate-900 px-2 py-2 text-left text-slate-200">
                  Framework
                </th>
                {shortlistedNodes.map((column) => (
                  <th
                    key={column.id}
                    className="border-b border-slate-700 px-2 py-2 text-center text-slate-300"
                    title={column.label}
                  >
                    <button
                      type="button"
                      onClick={() => onNodeSelect?.(column.id)}
                      className="max-w-[108px] truncate"
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shortlistedNodes.map((row) => (
                <tr key={row.id}>
                  <th className="sticky left-0 z-10 border-r border-slate-700 bg-slate-900 px-2 py-1.5 text-left font-medium text-slate-200">
                    <button
                      type="button"
                      onClick={() => onNodeSelect?.(row.id)}
                      className="max-w-[160px] truncate text-left"
                      title={row.label}
                    >
                      {row.label}
                    </button>
                  </th>

                  {shortlistedNodes.map((column) => {
                    if (row.id === column.id) {
                      return (
                        <td key={`${row.id}-${column.id}`} className="border border-slate-800 bg-slate-950/80 px-2 py-1 text-center text-slate-500">
                          —
                        </td>
                      );
                    }

                    const key = pairKey(row.id, column.id);
                    const edge = strongestEdgeByPair.get(key);
                    const hiddenByFilter = edge && filter !== "all" && edge.relationType !== filter;
                    const selected =
                      selectedEdge && pairKey(selectedEdge.source, selectedEdge.target) === key;

                    if (!edge || hiddenByFilter) {
                      return (
                        <td
                          key={`${row.id}-${column.id}`}
                          className="border border-slate-800 bg-slate-950/55 px-2 py-1 text-center text-slate-600"
                        >
                          ·
                        </td>
                      );
                    }

                    return (
                      <td key={`${row.id}-${column.id}`} className="border border-slate-800 p-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEdgeKey(key);
                            onNodeSelect?.(row.id);
                          }}
                          className={`w-full rounded border px-1 py-1 text-[10px] font-medium transition ${relationClass(
                            edge.relationType,
                          )} ${selected ? "ring-1 ring-sky-300/70" : "hover:ring-1 hover:ring-slate-300/40"}`}
                          title={`${row.label} ↔ ${column.label}: ${edge.rationale}`}
                        >
                          {(edge.weight * 100).toFixed(0)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
