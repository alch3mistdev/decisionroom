"use client";

import * as d3 from "d3";

import type { FrameworkResult } from "@/lib/types";

interface Props {
  result: FrameworkResult;
}

interface BarRow {
  label: string;
  value: number;
  secondary?: number;
}

const WIDTH = 540;
const HEIGHT = 300;
const PADDING = { top: 24, right: 24, bottom: 42, left: 52 };

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
      ? asArrayFromKeys(data, ["rows", "items", "timeline", "data", "values"]).map((rowRaw, index) => {
          const row = asRecord(rowRaw);
          return {
            label: asString(row.horizon, `row-${index + 1}`),
            value: asNumber(row.positive),
            secondary: asNumber(row.negative),
          };
        })
      : asArrayFromKeys(data, ["rows", "items", "series", "data", "values"]).map((rowRaw, index) => {
          const row = asRecord(rowRaw);
          const label =
            asString(row.label) ||
            asString(row.segment) ||
            asString(row.stakeholder) ||
            asString(row.horizon) ||
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
  const raw = asArrayFromKeys(result.vizPayload.data, ["points", "rows", "data", "values"]);

  const points = raw.map((pointRaw, index) => {
    const point = asRecord(pointRaw);
    const label = asString(point.label) || asString(point.option) || `point-${index + 1}`;
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
  const points = asArrayFromKeys(payload.phases, ["points"]).map((pointRaw, index) => {
    const point = asRecord(pointRaw);
    return {
      phase: asString(point.phase, `P${index + 1}`),
      x: asNumber(point.x),
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

  const currentX = asNumber(payload.currentPosition, 0.5);

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

export function FrameworkVisualization({ result }: Props) {
  const type = result.vizPayload.type;

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.4)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-100">{result.vizPayload.title}</h4>
        <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
          Fit {formatPercent(result.applicabilityScore)}
        </span>
      </div>

      {type === "swot" ? <SwotGrid result={result} /> : null}
      {type === "list" ? <ListViz result={result} /> : null}
      {type === "quadrant" ? <QuadrantViz result={result} /> : null}
      {type === "radar" ? <RadarViz result={result} /> : null}
      {type === "line" ? <LineViz result={result} /> : null}
      {type === "scatter" ? <ScatterViz result={result} /> : null}
      {type === "bar" || type === "histogram" || type === "timeline" ? <BarLikeViz result={result} /> : null}
    </div>
  );
}
