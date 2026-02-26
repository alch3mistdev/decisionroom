"use client";

import type React from "react";
import * as d3 from "d3";

import type {
  BcgVizData,
  ChasmVizData,
  ConflictResolutionVizData,
  ConsequencesVizData,
  CrossroadsVizData,
  DoubleLoopVizData,
  EisenhowerVizData,
  FrameworkResult,
  HypeCycleVizData,
  MonteCarloVizData,
  ParetoVizData,
  ProjectPortfolioVizData,
  SwotVizData,
} from "@/lib/types";
import { isTop12FrameworkId } from "@/lib/frameworks/visual-contracts";

interface Props {
  result: FrameworkResult;
}

interface BarRow {
  label: string;
  value: number;
  secondary?: number;
}

const WIDTH = 560;
const HEIGHT = 300;
const PADDING = { top: 24, right: 26, bottom: 42, left: 52 };

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function asArrayFromKeys(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

function toTitleCase(value: string): string {
  return value
    .replaceAll(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function asCanonicalData<T extends { kind: string }>(value: unknown, kind: T["kind"]): T | null {
  const record = asRecord(value);
  return record.kind === kind ? (record as T) : null;
}

function SwotGrid({ result }: Props) {
  const data = asRecord(result.vizPayload.data);
  const strengths = asStringArray(data.strengths);
  const weaknesses = asStringArray(data.weaknesses);
  const opportunities = asStringArray(data.opportunities);
  const threats = asStringArray(data.threats);

  const sections = [
    { title: "Strengths", items: strengths, tone: "border-emerald-400/40 bg-emerald-500/10" },
    { title: "Weaknesses", items: weaknesses, tone: "border-rose-400/40 bg-rose-500/10" },
    { title: "Opportunities", items: opportunities, tone: "border-sky-400/40 bg-sky-500/10" },
    { title: "Threats", items: threats, tone: "border-amber-400/40 bg-amber-500/10" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {sections.map((section) => (
        <div key={section.title} className={`rounded-xl border p-3 ${section.tone}`}>
          <h5 className="mb-2 text-sm font-semibold tracking-wide text-slate-100">{section.title}</h5>
          <ul className="space-y-1 text-xs text-slate-200">
            {section.items.slice(0, 4).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ListViz({ result }: Props) {
  const data = asArray(result.vizPayload.data).filter(isRecord);

  return (
    <div className="space-y-2 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3 text-xs text-slate-200">
      {data.map((item, index) => (
        <div
          key={`${index}-${asString(item.behavior, "row")}`}
          className="rounded-lg border border-slate-800/80 p-2"
        >
          {Object.entries(item).map(([key, value]) => (
            <p key={key}>
              <span className="mr-1 font-semibold capitalize text-slate-300">{key.replaceAll(/([A-Z])/g, " $1")}: </span>
              <span>{String(value)}</span>
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function BarLikeViz({ result }: Props) {
  const isHistogram = result.vizPayload.type === "histogram";
  const isTimeline = result.vizPayload.type === "timeline";
  const data = result.vizPayload.data;

  const rows: BarRow[] = isHistogram
    ? asArrayFromKeys(data, ["bins"]).map((binRaw) => {
        const bin = asRecord(binRaw);
        const start = asNumber(bin.binStart);
        const end = asNumber(bin.binEnd);
        const count = asNumber(bin.count);

        return {
          label: `${Math.round(start * 100)}-${Math.round(end * 100)}%`,
          value: count,
        };
      })
    : isTimeline
      ? asArrayFromKeys(data, ["rows", "items", "timeline", "data", "values", "horizons"]).map((rowRaw, index) => {
          const row = asRecord(rowRaw);
          return {
            label: asString(row.horizon, `row-${index + 1}`),
            value: asNumber(row.positive, asNumber(row.direct)),
            secondary: asNumber(row.negative, asNumber(row.indirect)),
          };
        })
      : asArrayFromKeys(data, ["rows", "items", "series", "data", "values", "segments", "factors"]).map((rowRaw, index) => {
          const row = asRecord(rowRaw);
          const label =
            asString(row.label) ||
            asString(row.segment) ||
            asString(row.stakeholder) ||
            asString(row.horizon) ||
            asString(row.mode) ||
            `item-${index + 1}`;
          const numericEntries = Object.values(row).filter(
            (value): value is number => typeof value === "number" && Number.isFinite(value),
          );
          const primary = numericEntries[0] ?? 0;
          const secondary = numericEntries[1];

          return {
            label,
            value: primary,
            secondary,
          };
        });

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxValue = d3.max(rows, (row: BarRow) => Math.max(row.value, row.secondary ?? 0)) ?? 1;

  const x = d3
    .scaleBand<string>()
    .domain(rows.map((row: BarRow) => row.label))
    .range([0, innerWidth])
    .padding(0.16);

  const y = d3.scaleLinear().domain([0, maxValue]).nice().range([innerHeight, 0]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[260px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {rows.map((row) => {
          const xPos = x(row.label) ?? 0;
          const width = x.bandwidth();
          const yPrimary = y(row.value);
          const primaryHeight = innerHeight - yPrimary;
          const ySecondary = row.secondary !== undefined ? y(row.secondary) : yPrimary;
          const secondaryHeight = row.secondary !== undefined ? innerHeight - ySecondary : 0;

          return (
            <g key={row.label}>
              <rect
                x={xPos}
                y={yPrimary}
                width={width}
                height={primaryHeight}
                rx={4}
                fill="rgba(56,189,248,0.85)"
              />
              {row.secondary !== undefined ? (
                <rect
                  x={xPos + width * 0.15}
                  y={ySecondary}
                  width={width * 0.7}
                  height={secondaryHeight}
                  rx={4}
                  fill="rgba(248,113,113,0.78)"
                />
              ) : null}
            </g>
          );
        })}

        {(x.domain() as string[]).map((label: string) => (
          <text
            key={label}
            x={(x(label) ?? 0) + x.bandwidth() / 2}
            y={innerHeight + 18}
            fontSize="10"
            fill="#cbd5e1"
            textAnchor="middle"
          >
            {label.length > 12 ? `${label.slice(0, 12)}…` : label}
          </text>
        ))}

        {y.ticks(4).map((tick: number) => (
          <g key={tick}>
            <line x1={0} y1={y(tick)} x2={innerWidth} y2={y(tick)} stroke="rgba(148,163,184,0.22)" />
            <text x={-8} y={y(tick) + 4} fontSize="10" fill="#94a3b8" textAnchor="end">
              {Number.isInteger(tick) ? tick : tick.toFixed(2)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ScatterViz({ result }: Props) {
  const raw = asArrayFromKeys(result.vizPayload.data, ["points", "rows", "data", "values", "options", "modes"]);

  const points = raw.map((pointRaw, index) => {
    const point = asRecord(pointRaw);
    const label =
      asString(point.label) ||
      asString(point.option) ||
      asString(point.mode) ||
      `point-${index + 1}`;

    if (typeof point.share === "number" && typeof point.growth === "number") {
      return {
        label,
        x: asNumber(point.share),
        y: asNumber(point.growth),
        size: asNumber(point.size, 28),
      };
    }

    if (typeof point.risk === "number" && typeof point.value === "number") {
      return {
        label,
        x: asNumber(point.risk),
        y: asNumber(point.value),
        size: asNumber(point.size, 28),
      };
    }

    if (typeof point.feasibility === "number" && typeof point.desirability === "number") {
      return {
        label,
        x: asNumber(point.feasibility),
        y: asNumber(point.desirability),
        size: asNumber(point.size, 28),
      };
    }

    if (typeof point.assertiveness === "number" && typeof point.cooperativeness === "number") {
      return {
        label,
        x: asNumber(point.assertiveness),
        y: asNumber(point.cooperativeness),
        size: 28,
      };
    }

    const numbers = Object.values(point).filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );

    return {
      label,
      x: numbers[0] ?? 0,
      y: numbers[1] ?? 0,
      size: numbers[2] ?? 18,
    };
  });

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = d3
    .scaleLinear()
    .domain([0, d3.max(points, (point: { x: number }) => point.x) ?? 1])
    .nice()
    .range([0, innerWidth]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(points, (point: { y: number }) => point.y) ?? 1])
    .nice()
    .range([innerHeight, 0]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[260px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {x.ticks(5).map((tick: number) => (
          <line
            key={`x-${tick}`}
            x1={x(tick)}
            y1={0}
            x2={x(tick)}
            y2={innerHeight}
            stroke="rgba(148,163,184,0.16)"
          />
        ))}

        {y.ticks(5).map((tick: number) => (
          <line
            key={`y-${tick}`}
            x1={0}
            y1={y(tick)}
            x2={innerWidth}
            y2={y(tick)}
            stroke="rgba(148,163,184,0.16)"
          />
        ))}

        {points.map((point) => (
          <g key={point.label}>
            <circle
              cx={x(point.x)}
              cy={y(point.y)}
              r={Math.max(5, Math.min(24, point.size / 4))}
              fill="rgba(14,165,233,0.75)"
              stroke="rgba(125,211,252,0.92)"
            />
            <text x={x(point.x)} y={y(point.y) - 10} textAnchor="middle" fill="#dbeafe" fontSize="10">
              {point.label.length > 10 ? `${point.label.slice(0, 10)}…` : point.label}
            </text>
          </g>
        ))}

        <text x={innerWidth / 2} y={innerHeight + 30} textAnchor="middle" fill="#93c5fd" fontSize="11">
          {result.vizPayload.xLabel ?? "X Axis"}
        </text>
        <text
          x={-innerHeight / 2}
          y={-36}
          transform="rotate(-90)"
          textAnchor="middle"
          fill="#93c5fd"
          fontSize="11"
        >
          {result.vizPayload.yLabel ?? "Y Axis"}
        </text>
      </g>
    </svg>
  );
}

function LineViz({ result }: Props) {
  const payload = asRecord(result.vizPayload.data);
  const pointSource = asArrayFromKeys(payload, ["phases", "points", "horizons"]);
  const points = pointSource.map((pointRaw, index) => {
    const point = asRecord(pointRaw);

    if (typeof point.direct === "number" || typeof point.indirect === "number") {
      return {
        phase: asString(point.horizon, `P${index + 1}`),
        x: pointSource.length <= 1 ? 0.5 : index / Math.max(pointSource.length - 1, 1),
        y: asNumber(point.direct, asNumber(point.indirect)),
      };
    }

    return {
      phase: asString(point.phase, `P${index + 1}`),
      x: asNumber(point.x, pointSource.length <= 1 ? 0.5 : index / Math.max(pointSource.length - 1, 1)),
      y: asNumber(point.y),
    };
  });
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  const line = d3
    .line<{ x: number; y: number }>()
    .x((point: { x: number; y: number }) => x(point.x))
    .y((point: { x: number; y: number }) => y(point.y))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const currentRaw = asRecord(payload.current);
  const currentX = asNumber(currentRaw.x, asNumber(payload.currentPosition, 0.5));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[260px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        <path d={line(points) ?? ""} fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth={3} />
        {points.map((point) => (
          <g key={point.phase}>
            <circle cx={x(point.x)} cy={y(point.y)} r={5} fill="#38bdf8" />
            <text x={x(point.x)} y={y(point.y) - 10} fontSize="10" fill="#bae6fd" textAnchor="middle">
              {point.phase}
            </text>
          </g>
        ))}
        <line
          x1={x(currentX)}
          y1={0}
          x2={x(currentX)}
          y2={innerHeight}
          stroke="rgba(248,250,252,0.5)"
          strokeDasharray="4 5"
        />
      </g>
    </svg>
  );
}

function QuadrantViz({ result }: Props) {
  const data = result.vizPayload.data;
  const labelByKey: Record<string, string> = {
    do: "Do First",
    schedule: "Schedule",
    delegate: "Delegate",
    eliminate: "Eliminate",
    q1: "Q1",
    q2: "Q2",
    q3: "Q3",
    q4: "Q4",
  };

  let quadrantRaw = asArrayFromKeys(data, ["quadrants", "data", "items"]);

  if (quadrantRaw.length === 0 && isRecord(data)) {
    quadrantRaw = Object.entries(data).map(([id, value]) => {
      if (Array.isArray(value)) {
        return { id, label: labelByKey[id] ?? toTitleCase(id), items: value, count: value.length };
      }

      if (isRecord(value)) {
        return {
          id: asString(value.id, id),
          label: asString(value.label, labelByKey[id] ?? toTitleCase(id)),
          items: value.items,
          count: value.count,
        };
      }

      return {
        id,
        label: labelByKey[id] ?? toTitleCase(id),
        items: [],
        count: 0,
      };
    });
  }

  const quadrants = quadrantRaw
    .map((quadrantRawValue, index) => {
      const quadrant = asRecord(quadrantRawValue);
      const id = asString(quadrant.id, `quadrant-${index + 1}`);
      const label =
        asString(quadrant.label) || labelByKey[id] || toTitleCase(id) || `Quadrant ${index + 1}`;
      const items = asStringArray(quadrant.items);
      const count = Math.max(0, Math.round(asNumber(quadrant.count, items.length)));
      return {
        id,
        label,
        count,
        items,
      };
    })
    .filter((quadrant) => quadrant.count > 0 || quadrant.items.length > 0);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {quadrants.map((quadrant) => (
        <div key={quadrant.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <h5 className="text-sm font-semibold text-slate-100">{quadrant.label}</h5>
          <p className="mb-2 text-xs text-slate-400">{quadrant.count} items</p>
          <ul className="space-y-1 text-xs text-slate-200">
            {quadrant.items.slice(0, 3).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RadarViz({ result }: Props) {
  const rows = asArrayFromKeys(result.vizPayload.data, ["axes", "rows", "data", "values"]).map(
    (rowRaw, index) => {
      const row = asRecord(rowRaw);
      return {
        axis: asString(row.axis, `Axis ${index + 1}`),
        value: asNumber(row.value),
      };
    },
  );
  const cx = 180;
  const cy = 150;
  const radius = 110;
  const angleStep = (Math.PI * 2) / Math.max(rows.length, 1);

  const points = rows
    .map((row, index) => {
      const angle = -Math.PI / 2 + index * angleStep;
      const x = cx + Math.cos(angle) * radius * row.value;
      const y = cy + Math.sin(angle) * radius * row.value;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 360 300" className="h-[260px] w-full rounded-xl bg-slate-950/80">
      <g>
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <circle
            key={ring}
            cx={cx}
            cy={cy}
            r={radius * ring}
            fill="none"
            stroke="rgba(148,163,184,0.2)"
          />
        ))}

        {rows.map((row, index) => {
          const angle = -Math.PI / 2 + index * angleStep;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          return (
            <g key={row.axis}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(148,163,184,0.22)" />
              <text x={x} y={y} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                {row.axis}
              </text>
            </g>
          );
        })}

        <polygon points={points} fill="rgba(14,165,233,0.35)" stroke="rgba(56,189,248,0.9)" strokeWidth={2} />
      </g>
    </svg>
  );
}

function EisenhowerMatrixViz({ data }: { data: EisenhowerVizData }) {
  const colorByQuadrant: Record<EisenhowerVizData["points"][number]["quadrant"], string> = {
    do: "#34d399",
    schedule: "#60a5fa",
    delegate: "#f59e0b",
    eliminate: "#f87171",
  };

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[230px] w-full rounded-xl bg-slate-950/80">
        <g transform={`translate(${PADDING.left},${PADDING.top})`}>
          <rect x={0} y={0} width={innerWidth} height={innerHeight} fill="rgba(15,23,42,0.36)" />
          <line x1={x(0.5)} y1={0} x2={x(0.5)} y2={innerHeight} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
          <line x1={0} y1={y(0.5)} x2={innerWidth} y2={y(0.5)} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />

          {data.points.map((point) => (
            <g key={point.label}>
              <circle cx={x(point.urgency)} cy={y(point.importance)} r={6} fill={colorByQuadrant[point.quadrant]} />
              <text x={x(point.urgency) + 8} y={y(point.importance) - 8} fill="#e2e8f0" fontSize="10">
                {point.label.length > 20 ? `${point.label.slice(0, 20)}…` : point.label}
              </text>
            </g>
          ))}

          <text x={innerWidth / 2} y={innerHeight + 28} textAnchor="middle" fill="#93c5fd" fontSize="11">
            Urgency
          </text>
          <text x={-innerHeight / 2} y={-34} transform="rotate(-90)" textAnchor="middle" fill="#93c5fd" fontSize="11">
            Importance
          </text>
        </g>
      </svg>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.quadrants.map((quadrant) => (
          <div key={quadrant.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
            <h5 className="text-sm font-semibold text-slate-100">{quadrant.label}</h5>
            <p className="mb-2 text-xs text-slate-400">{quadrant.count} tasks</p>
            <ul className="space-y-1 text-xs text-slate-200">
              {quadrant.items.slice(0, 3).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function BcgViz({ data }: { data: BcgVizData }) {
  const points = data.points;
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[250px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        <rect x={0} y={0} width={innerWidth} height={innerHeight} fill="rgba(15,23,42,0.36)" />
        <line x1={x(0.5)} y1={0} x2={x(0.5)} y2={innerHeight} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />
        <line x1={0} y1={y(0.5)} x2={innerWidth} y2={y(0.5)} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />

        <text x={10} y={16} fill="#fde68a" fontSize="10">{data.quadrants.topLeft}</text>
        <text x={innerWidth - 8} y={16} textAnchor="end" fill="#86efac" fontSize="10">{data.quadrants.topRight}</text>
        <text x={10} y={innerHeight - 8} fill="#fca5a5" fontSize="10">{data.quadrants.bottomLeft}</text>
        <text x={innerWidth - 8} y={innerHeight - 8} textAnchor="end" fill="#93c5fd" fontSize="10">{data.quadrants.bottomRight}</text>

        {points.map((point) => (
          <g key={point.id}>
            <circle
              cx={x(point.share)}
              cy={y(point.growth)}
              r={Math.max(8, Math.min(24, point.size / 4))}
              fill="rgba(14,165,233,0.45)"
              stroke="rgba(125,211,252,0.95)"
            />
            <text x={x(point.share)} y={y(point.growth) + 3} fill="#e2e8f0" fontSize="10" textAnchor="middle">
              {point.label.length > 12 ? `${point.label.slice(0, 12)}…` : point.label}
            </text>
          </g>
        ))}

        <text x={innerWidth / 2} y={innerHeight + 28} textAnchor="middle" fill="#93c5fd" fontSize="11">
          Relative Market Share
        </text>
        <text x={-innerHeight / 2} y={-34} transform="rotate(-90)" textAnchor="middle" fill="#93c5fd" fontSize="11">
          Market Growth
        </text>
      </g>
    </svg>
  );
}

function ProjectPortfolioViz({ data }: { data: ProjectPortfolioVizData }) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[250px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        <rect x={0} y={0} width={innerWidth} height={innerHeight} fill="rgba(15,23,42,0.36)" />
        <line x1={x(0.5)} y1={0} x2={x(0.5)} y2={innerHeight} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />
        <line x1={0} y1={y(0.5)} x2={innerWidth} y2={y(0.5)} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />

        <text x={10} y={16} fill="#fda4af" fontSize="10">{data.quadrants.topLeft}</text>
        <text x={innerWidth - 8} y={16} textAnchor="end" fill="#fde68a" fontSize="10">{data.quadrants.topRight}</text>
        <text x={10} y={innerHeight - 8} fill="#93c5fd" fontSize="10">{data.quadrants.bottomLeft}</text>
        <text x={innerWidth - 8} y={innerHeight - 8} textAnchor="end" fill="#86efac" fontSize="10">{data.quadrants.bottomRight}</text>

        {data.points.map((point) => (
          <g key={point.id}>
            <circle
              cx={x(point.risk)}
              cy={y(point.value)}
              r={Math.max(6, Math.min(24, point.size / 4))}
              fill="rgba(56,189,248,0.5)"
              stroke="rgba(125,211,252,0.95)"
            />
            <text x={x(point.risk)} y={y(point.value) - 10} fill="#e2e8f0" fontSize="10" textAnchor="middle">
              {point.label.length > 12 ? `${point.label.slice(0, 12)}…` : point.label}
            </text>
          </g>
        ))}

        <text x={innerWidth / 2} y={innerHeight + 28} textAnchor="middle" fill="#93c5fd" fontSize="11">
          Risk
        </text>
        <text x={-innerHeight / 2} y={-34} transform="rotate(-90)" textAnchor="middle" fill="#93c5fd" fontSize="11">
          Strategic Value
        </text>
      </g>
    </svg>
  );
}

function ParetoViz({ data }: { data: ParetoVizData }) {
  const rows = data.factors;
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3
    .scaleBand<string>()
    .domain(rows.map((row) => row.label))
    .range([0, innerWidth])
    .padding(0.16);

  const yLeft = d3.scaleLinear().domain([0, d3.max(rows, (row) => row.contribution) ?? 1]).nice().range([innerHeight, 0]);
  const yRight = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  const line = d3
    .line<{ label: string; cumulative: number }>()
    .x((point) => (x(point.label) ?? 0) + x.bandwidth() / 2)
    .y((point) => yRight(point.cumulative));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[250px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {rows.map((row) => (
          <rect
            key={row.label}
            x={x(row.label) ?? 0}
            y={yLeft(row.contribution)}
            width={x.bandwidth()}
            height={innerHeight - yLeft(row.contribution)}
            fill="rgba(56,189,248,0.82)"
            rx={4}
          />
        ))}

        <path d={line(rows) ?? ""} fill="none" stroke="rgba(251,191,36,0.95)" strokeWidth={2.5} />
        <line
          x1={0}
          y1={yRight(data.threshold)}
          x2={innerWidth}
          y2={yRight(data.threshold)}
          stroke="rgba(251,191,36,0.6)"
          strokeDasharray="4 4"
        />

        {rows.map((row) => (
          <text
            key={`${row.label}-x`}
            x={(x(row.label) ?? 0) + x.bandwidth() / 2}
            y={innerHeight + 18}
            textAnchor="middle"
            fill="#cbd5e1"
            fontSize="10"
          >
            {row.label.length > 12 ? `${row.label.slice(0, 12)}…` : row.label}
          </text>
        ))}

        {yLeft.ticks(4).map((tick) => (
          <text key={`l-${tick}`} x={-8} y={yLeft(tick) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
            {(tick * 100).toFixed(0)}%
          </text>
        ))}
        {yRight.ticks(4).map((tick) => (
          <text key={`r-${tick}`} x={innerWidth + 8} y={yRight(tick) + 4} fontSize="10" fill="#fcd34d">
            {(tick * 100).toFixed(0)}%
          </text>
        ))}
      </g>
    </svg>
  );
}

function HypeCycleViz({ data }: { data: HypeCycleVizData }) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  const line = d3
    .line<{ x: number; y: number }>()
    .x((point) => x(point.x))
    .y((point) => y(point.y))
    .curve(d3.curveCatmullRom.alpha(0.5));

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[250px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        <path d={line(data.phases) ?? ""} fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth={3} />

        {data.phases.map((phase) => (
          <g key={phase.phase}>
            <circle cx={x(phase.x)} cy={y(phase.y)} r={5} fill="#38bdf8" />
            <text x={x(phase.x)} y={y(phase.y) - 10} textAnchor="middle" fill="#bae6fd" fontSize="10">
              {phase.phase.length > 18 ? `${phase.phase.slice(0, 18)}…` : phase.phase}
            </text>
          </g>
        ))}

        <line
          x1={x(data.current.x)}
          y1={0}
          x2={x(data.current.x)}
          y2={innerHeight}
          stroke="rgba(251,191,36,0.75)"
          strokeDasharray="4 4"
        />
        <circle cx={x(data.current.x)} cy={y(data.current.y)} r={7} fill="rgba(251,191,36,0.95)" />

        <text x={x(data.current.x) + 10} y={y(data.current.y) - 12} fill="#fef3c7" fontSize="11">
          {data.current.phase}
        </text>
      </g>
    </svg>
  );
}

function ChasmViz({ data }: { data: ChasmVizData }) {
  const rows = data.segments;
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleBand<string>().domain(rows.map((row) => row.segment)).range([0, innerWidth]).padding(0.16);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const chasmIndex = Math.max(rows.findIndex((row) => row.segment === data.chasmAfter), 1);
  const chasmX = (x(rows[chasmIndex]?.segment ?? rows[1].segment) ?? 0) + x.bandwidth();

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[250px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {rows.map((row) => (
          <rect
            key={row.segment}
            x={x(row.segment) ?? 0}
            y={y(row.adoption)}
            width={x.bandwidth()}
            height={innerHeight - y(row.adoption)}
            rx={4}
            fill="rgba(56,189,248,0.8)"
          />
        ))}

        <line x1={chasmX} y1={0} x2={chasmX} y2={innerHeight} stroke="rgba(248,113,113,0.8)" strokeDasharray="5 4" />
        <text x={chasmX + 6} y={16} fill="#fecaca" fontSize="10">Chasm ({(data.gap * 100).toFixed(0)}%)</text>

        {rows.map((row) => (
          <text
            key={`${row.segment}-x`}
            x={(x(row.segment) ?? 0) + x.bandwidth() / 2}
            y={innerHeight + 18}
            textAnchor="middle"
            fill="#cbd5e1"
            fontSize="10"
          >
            {row.segment.length > 12 ? `${row.segment.slice(0, 12)}…` : row.segment}
          </text>
        ))}
      </g>
    </svg>
  );
}

function MonteCarloViz({ data }: { data: MonteCarloVizData }) {
  const rows = data.bins;
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3
    .scaleBand<string>()
    .domain(rows.map((row) => `${Math.round(row.binStart * 100)}-${Math.round(row.binEnd * 100)}%`))
    .range([0, innerWidth])
    .padding(0.12);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (row) => row.count) ?? 1]).nice().range([innerHeight, 0]);
  const percentileX = (value: number) => value * innerWidth;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[250px] w-full rounded-xl bg-slate-950/80">
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {rows.map((row) => {
          const label = `${Math.round(row.binStart * 100)}-${Math.round(row.binEnd * 100)}%`;
          return (
            <rect
              key={label}
              x={x(label) ?? 0}
              y={y(row.count)}
              width={x.bandwidth()}
              height={innerHeight - y(row.count)}
              rx={3}
              fill="rgba(56,189,248,0.82)"
            />
          );
        })}

        <line x1={percentileX(data.p10)} y1={0} x2={percentileX(data.p10)} y2={innerHeight} stroke="#fca5a5" strokeDasharray="4 4" />
        <line x1={percentileX(data.p50)} y1={0} x2={percentileX(data.p50)} y2={innerHeight} stroke="#fcd34d" strokeDasharray="4 4" />
        <line x1={percentileX(data.p90)} y1={0} x2={percentileX(data.p90)} y2={innerHeight} stroke="#86efac" strokeDasharray="4 4" />

        <text x={percentileX(data.p10) + 4} y={14} fill="#fecaca" fontSize="10">P10</text>
        <text x={percentileX(data.p50) + 4} y={14} fill="#fef3c7" fontSize="10">P50</text>
        <text x={percentileX(data.p90) + 4} y={14} fill="#bbf7d0" fontSize="10">P90</text>
      </g>
    </svg>
  );
}

function ConsequencesViz({ data }: { data: ConsequencesVizData }) {
  const rows = data.horizons;
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3
    .scalePoint<string>()
    .domain(rows.map((row) => row.horizon))
    .range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  const directLine = d3
    .line<{ horizon: string; direct: number }>()
    .x((point) => x(point.horizon) ?? 0)
    .y((point) => y(point.direct));
  const indirectLine = d3
    .line<{ horizon: string; indirect: number }>()
    .x((point) => x(point.horizon) ?? 0)
    .y((point) => y(point.indirect));

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[235px] w-full rounded-xl bg-slate-950/80">
        <g transform={`translate(${PADDING.left},${PADDING.top})`}>
          <path d={directLine(rows) ?? ""} fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth={2.5} />
          <path d={indirectLine(rows) ?? ""} fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth={2.2} strokeDasharray="6 4" />

          {rows.map((row) => (
            <g key={row.horizon}>
              <circle cx={x(row.horizon) ?? 0} cy={y(row.direct)} r={4} fill="#38bdf8" />
              <circle cx={x(row.horizon) ?? 0} cy={y(row.indirect)} r={4} fill="#f87171" />
              <text x={x(row.horizon) ?? 0} y={innerHeight + 18} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                {row.horizon}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        {rows.map((row) => (
          <div key={`${row.horizon}-net`} className="rounded-lg border border-slate-700 bg-slate-950/70 p-2 text-xs">
            <p className="font-semibold text-slate-100">{row.horizon}</p>
            <p className="text-sky-200">Direct {(row.direct * 100).toFixed(0)}%</p>
            <p className="text-rose-200">Indirect {(row.indirect * 100).toFixed(0)}%</p>
            <p className="text-slate-300">Net {(row.net * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CrossroadsViz({ data }: { data: CrossroadsVizData }) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[235px] w-full rounded-xl bg-slate-950/80">
        <g transform={`translate(${PADDING.left},${PADDING.top})`}>
          <line x1={x(0.5)} y1={0} x2={x(0.5)} y2={innerHeight} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />
          <line x1={0} y1={y(0.5)} x2={innerWidth} y2={y(0.5)} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />

          {data.options.map((option) => (
            <g key={option.option}>
              <circle
                cx={x(option.feasibility)}
                cy={y(option.desirability)}
                r={Math.max(7, Math.min(22, option.size / 4))}
                fill="rgba(14,165,233,0.5)"
                stroke="rgba(125,211,252,0.95)"
              />
              <text x={x(option.feasibility)} y={y(option.desirability) - 10} textAnchor="middle" fill="#dbeafe" fontSize="10">
                {option.option.length > 14 ? `${option.option.slice(0, 14)}…` : option.option}
              </text>
            </g>
          ))}

          <text x={innerWidth / 2} y={innerHeight + 28} textAnchor="middle" fill="#93c5fd" fontSize="11">
            Feasibility
          </text>
          <text x={-innerHeight / 2} y={-34} transform="rotate(-90)" textAnchor="middle" fill="#93c5fd" fontSize="11">
            Desirability
          </text>
        </g>
      </svg>
      <ul className="space-y-1 text-xs text-slate-200">
        {data.options.map((option) => (
          <li key={`${option.option}-note`}>• {option.option}: {option.note}</li>
        ))}
      </ul>
    </div>
  );
}

function ConflictResolutionViz({ data }: { data: ConflictResolutionVizData }) {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[235px] w-full rounded-xl bg-slate-950/80">
        <g transform={`translate(${PADDING.left},${PADDING.top})`}>
          <line x1={x(0.5)} y1={0} x2={x(0.5)} y2={innerHeight} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />
          <line x1={0} y1={y(0.5)} x2={innerWidth} y2={y(0.5)} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 4" />

          {data.modes.map((mode) => (
            <g key={mode.mode}>
              <circle
                cx={x(mode.assertiveness)}
                cy={y(mode.cooperativeness)}
                r={mode.mode === data.recommendedMode ? 9 : 6}
                fill={mode.mode === data.recommendedMode ? "rgba(251,191,36,0.95)" : "rgba(56,189,248,0.75)"}
              />
              <text x={x(mode.assertiveness)} y={y(mode.cooperativeness) - 11} textAnchor="middle" fill="#dbeafe" fontSize="10">
                {mode.mode}
              </text>
            </g>
          ))}

          <text x={innerWidth / 2} y={innerHeight + 28} textAnchor="middle" fill="#93c5fd" fontSize="11">
            Assertiveness
          </text>
          <text x={-innerHeight / 2} y={-34} transform="rotate(-90)" textAnchor="middle" fill="#93c5fd" fontSize="11">
            Cooperativeness
          </text>
        </g>
      </svg>
      <p className="text-xs text-amber-100">Recommended mode: {data.recommendedMode}</p>
    </div>
  );
}

function DoubleLoopViz({ data }: { data: DoubleLoopVizData }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-300">Single-loop fixes optimize behavior; double-loop updates governing assumptions.</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {data.loops.map((loop) => (
          <div key={loop.behavior} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">
            <p className="font-semibold text-slate-100">Behavior</p>
            <p>{loop.behavior}</p>
            <p className="mt-2 font-semibold text-slate-100">Single-loop fix</p>
            <p>{loop.singleLoopFix}</p>
            <p className="mt-2 font-semibold text-slate-100">Root assumption</p>
            <p>{loop.rootAssumption}</p>
            <p className="mt-2 text-slate-400">Leverage {(loop.leverage * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderTop12Visualization(result: FrameworkResult): React.ReactNode | null {
  if (!isTop12FrameworkId(result.frameworkId)) {
    return null;
  }

  switch (result.frameworkId) {
    case "eisenhower_matrix": {
      const data = asCanonicalData<EisenhowerVizData>(result.vizPayload.data, "eisenhower_matrix");
      return data ? <EisenhowerMatrixViz data={data} /> : null;
    }
    case "swot_analysis": {
      return asCanonicalData<SwotVizData>(result.vizPayload.data, "swot_analysis")
        ? <SwotGrid result={result} />
        : null;
    }
    case "bcg_matrix": {
      const data = asCanonicalData<BcgVizData>(result.vizPayload.data, "bcg_matrix");
      return data ? <BcgViz data={data} /> : null;
    }
    case "project_portfolio_matrix": {
      const data = asCanonicalData<ProjectPortfolioVizData>(result.vizPayload.data, "project_portfolio_matrix");
      return data ? <ProjectPortfolioViz data={data} /> : null;
    }
    case "pareto_principle": {
      const data = asCanonicalData<ParetoVizData>(result.vizPayload.data, "pareto_principle");
      return data ? <ParetoViz data={data} /> : null;
    }
    case "hype_cycle": {
      const data = asCanonicalData<HypeCycleVizData>(result.vizPayload.data, "hype_cycle");
      return data ? <HypeCycleViz data={data} /> : null;
    }
    case "chasm_diffusion_model": {
      const data = asCanonicalData<ChasmVizData>(result.vizPayload.data, "chasm_diffusion_model");
      return data ? <ChasmViz data={data} /> : null;
    }
    case "monte_carlo_simulation": {
      const data = asCanonicalData<MonteCarloVizData>(result.vizPayload.data, "monte_carlo_simulation");
      return data ? <MonteCarloViz data={data} /> : null;
    }
    case "consequences_model": {
      const data = asCanonicalData<ConsequencesVizData>(result.vizPayload.data, "consequences_model");
      return data ? <ConsequencesViz data={data} /> : null;
    }
    case "crossroads_model": {
      const data = asCanonicalData<CrossroadsVizData>(result.vizPayload.data, "crossroads_model");
      return data ? <CrossroadsViz data={data} /> : null;
    }
    case "conflict_resolution_model": {
      const data = asCanonicalData<ConflictResolutionVizData>(result.vizPayload.data, "conflict_resolution_model");
      return data ? <ConflictResolutionViz data={data} /> : null;
    }
    case "double_loop_learning": {
      const data = asCanonicalData<DoubleLoopVizData>(result.vizPayload.data, "double_loop_learning");
      return data ? <DoubleLoopViz data={data} /> : null;
    }
    default:
      return null;
  }
}

function renderFallbackByType(result: FrameworkResult): React.ReactNode {
  const type = result.vizPayload.type;

  if (type === "swot") {
    return <SwotGrid result={result} />;
  }
  if (type === "list") {
    return <ListViz result={result} />;
  }
  if (type === "quadrant") {
    return <QuadrantViz result={result} />;
  }
  if (type === "radar") {
    return <RadarViz result={result} />;
  }
  if (type === "line") {
    return <LineViz result={result} />;
  }
  if (type === "scatter") {
    return <ScatterViz result={result} />;
  }

  return <BarLikeViz result={result} />;
}

export function FrameworkVisualization({ result }: Props) {
  const canonical = renderTop12Visualization(result);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.4)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-100">{result.vizPayload.title}</h4>
        <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
          Fit {formatPercent(result.applicabilityScore)}
        </span>
      </div>
      {canonical ?? renderFallbackByType(result)}
    </div>
  );
}
