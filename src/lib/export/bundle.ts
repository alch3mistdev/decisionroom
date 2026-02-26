import { PassThrough } from "node:stream";

import archiver from "archiver";
import sharp from "sharp";

import { isTop12FrameworkId } from "@/lib/frameworks/visual-contracts";
import { renderMarkdownReport } from "@/lib/export/markdown";
import { sha1 } from "@/lib/utils/hash";
import type {
  BcgVizData,
  ChasmVizData,
  ConflictResolutionVizData,
  ConsequencesVizData,
  CrossroadsVizData,
  DecisionBrief,
  DoubleLoopVizData,
  EisenhowerVizData,
  ExportManifest,
  FrameworkResult,
  HypeCycleVizData,
  MonteCarloVizData,
  ParetoVizData,
  ProjectPortfolioVizData,
  PropagatedDecisionMap,
  SwotVizData,
  SynthesisSummary,
} from "@/lib/types";

interface BuildExportInput {
  decisionId: string;
  runId: string;
  brief: DecisionBrief;
  frameworkResults: FrameworkResult[];
  propagatedMap: PropagatedDecisionMap;
  synthesis: SynthesisSummary;
}

interface AssetRecord {
  frameworkId: string;
  svgPath: string;
  pngPath: string;
  svgContent: string;
  pngContent: Buffer;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cardSvg(title: string, subtitle: string, lines: string[]): string {
  const safeLines = lines.slice(0, 6).map((line, index) => {
    return `<text x="32" y="${112 + index * 28}" fill="#dbeafe" font-size="18" font-family="'IBM Plex Sans', sans-serif">${escapeXml(line)}</text>`;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#13203a"/><stop offset="100%" stop-color="#0b101f"/></linearGradient></defs>`,
    `<rect width="1280" height="720" rx="32" fill="url(#bg)"/>`,
    `<text x="32" y="56" fill="#f8fafc" font-size="40" font-weight="700" font-family="'IBM Plex Sans', sans-serif">${escapeXml(title)}</text>`,
    `<text x="32" y="90" fill="#93c5fd" font-size="22" font-family="'IBM Plex Sans', sans-serif">${escapeXml(subtitle)}</text>`,
    ...safeLines,
    `</svg>`,
  ].join("");
}

function frameSvg(title: string, subtitle: string, body: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#121f36"/><stop offset="100%" stop-color="#080d1a"/></linearGradient></defs>`,
    `<rect width="1280" height="720" rx="28" fill="url(#bg)"/>`,
    `<text x="34" y="58" fill="#f8fafc" font-size="38" font-weight="700" font-family="'IBM Plex Sans', sans-serif">${escapeXml(title)}</text>`,
    `<text x="34" y="90" fill="#93c5fd" font-size="20" font-family="'IBM Plex Sans', sans-serif">${escapeXml(subtitle)}</text>`,
    body,
    `</svg>`,
  ].join("");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function scatterBody(
  points: Array<{ label: string; x: number; y: number; size: number }>,
  xLabel: string,
  yLabel: string,
): string {
  const left = 110;
  const top = 130;
  const width = 1020;
  const height = 500;
  const toX = (x: number) => left + Math.max(0, Math.min(1, x)) * width;
  const toY = (y: number) => top + (1 - Math.max(0, Math.min(1, y))) * height;

  const circles = points
    .slice(0, 8)
    .map((point) => {
      const radius = Math.max(7, Math.min(28, point.size / 4));
      return [
        `<circle cx="${toX(point.x)}" cy="${toY(point.y)}" r="${radius}" fill="rgba(56,189,248,0.38)" stroke="rgba(125,211,252,0.95)" stroke-width="2" />`,
        `<text x="${toX(point.x)}" y="${toY(point.y) - 12}" text-anchor="middle" fill="#e2e8f0" font-size="14" font-family="'IBM Plex Sans', sans-serif">${escapeXml(point.label)}</text>`,
      ].join("");
    })
    .join("");

  return [
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgba(15,23,42,0.32)" stroke="rgba(148,163,184,0.35)" />`,
    `<line x1="${left + width / 2}" y1="${top}" x2="${left + width / 2}" y2="${top + height}" stroke="rgba(148,163,184,0.36)" stroke-dasharray="6 5" />`,
    `<line x1="${left}" y1="${top + height / 2}" x2="${left + width}" y2="${top + height / 2}" stroke="rgba(148,163,184,0.36)" stroke-dasharray="6 5" />`,
    circles,
    `<text x="${left + width / 2}" y="${top + height + 36}" text-anchor="middle" fill="#93c5fd" font-size="16">${escapeXml(xLabel)}</text>`,
    `<text transform="translate(48 ${top + height / 2}) rotate(-90)" text-anchor="middle" fill="#93c5fd" font-size="16">${escapeXml(yLabel)}</text>`,
  ].join("");
}

function lineBody(
  points: Array<{ label: string; x: number; y: number }>,
  xLabel: string,
  yLabel: string,
  markerX?: number,
): string {
  const left = 110;
  const top = 130;
  const width = 1020;
  const height = 500;
  const toX = (x: number) => left + Math.max(0, Math.min(1, x)) * width;
  const toY = (y: number) => top + (1 - Math.max(0, Math.min(1, y))) * height;
  const path = points
    .slice(0, 12)
    .map((point, index) => `${index === 0 ? "M" : "L"}${toX(point.x)} ${toY(point.y)}`)
    .join(" ");

  const pointMarkers = points
    .slice(0, 12)
    .map((point) => {
      return [
        `<circle cx="${toX(point.x)}" cy="${toY(point.y)}" r="6" fill="#38bdf8" />`,
        `<text x="${toX(point.x)}" y="${toY(point.y) - 12}" fill="#bae6fd" text-anchor="middle" font-size="12">${escapeXml(point.label)}</text>`,
      ].join("");
    })
    .join("");

  return [
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgba(15,23,42,0.32)" stroke="rgba(148,163,184,0.35)" />`,
    `<path d="${path}" fill="none" stroke="rgba(56,189,248,0.95)" stroke-width="4" />`,
    markerX !== undefined
      ? `<line x1="${toX(markerX)}" y1="${top}" x2="${toX(markerX)}" y2="${top + height}" stroke="rgba(251,191,36,0.85)" stroke-dasharray="6 4" />`
      : "",
    pointMarkers,
    `<text x="${left + width / 2}" y="${top + height + 36}" text-anchor="middle" fill="#93c5fd" font-size="16">${escapeXml(xLabel)}</text>`,
    `<text transform="translate(48 ${top + height / 2}) rotate(-90)" text-anchor="middle" fill="#93c5fd" font-size="16">${escapeXml(yLabel)}</text>`,
  ].join("");
}

function barBody(
  rows: Array<{ label: string; value: number; secondary?: number }>,
  xLabel: string,
  yLabel: string,
): string {
  const left = 110;
  const top = 130;
  const width = 1020;
  const height = 500;
  const count = Math.max(rows.length, 1);
  const band = width / count;
  const maxValue = Math.max(
    ...rows.map((row) => Math.max(row.value, row.secondary ?? 0)),
    1,
  );
  const toY = (value: number) => top + height - (Math.max(0, value) / maxValue) * height;

  const bars = rows
    .slice(0, 12)
    .map((row, index) => {
      const x = left + index * band + band * 0.08;
      const w = band * 0.74;
      const y = toY(row.value);
      const h = top + height - y;
      const primary = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(56,189,248,0.82)" rx="4" />`;
      const secondary =
        row.secondary !== undefined
          ? (() => {
              const ySecondary = toY(row.secondary);
              const hSecondary = top + height - ySecondary;
              return `<rect x="${x + w * 0.2}" y="${ySecondary}" width="${w * 0.6}" height="${hSecondary}" fill="rgba(248,113,113,0.75)" rx="4" />`;
            })()
          : "";
      const label = `<text x="${x + w / 2}" y="${top + height + 16}" text-anchor="middle" fill="#cbd5e1" font-size="11">${escapeXml(
        row.label,
      )}</text>`;
      return `${primary}${secondary}${label}`;
    })
    .join("");

  return [
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="rgba(15,23,42,0.32)" stroke="rgba(148,163,184,0.35)" />`,
    bars,
    `<text x="${left + width / 2}" y="${top + height + 36}" text-anchor="middle" fill="#93c5fd" font-size="16">${escapeXml(xLabel)}</text>`,
    `<text transform="translate(48 ${top + height / 2}) rotate(-90)" text-anchor="middle" fill="#93c5fd" font-size="16">${escapeXml(yLabel)}</text>`,
  ].join("");
}

function renderTop12FrameworkSvg(result: FrameworkResult): string | null {
  if (!isTop12FrameworkId(result.frameworkId)) {
    return null;
  }

  const data = asRecord(result.vizPayload.data);
  const kind = data.kind;

  if (kind === "eisenhower_matrix") {
    const typed = data as unknown as EisenhowerVizData;
    const points = typed.points.map((point) => ({
      label: point.label.length > 16 ? `${point.label.slice(0, 16)}…` : point.label,
      x: point.urgency,
      y: point.importance,
      size: 28,
    }));
    const body = scatterBody(points, "Urgency", "Importance");
    return frameSvg(result.frameworkName, "Eisenhower Matrix", body);
  }

  if (kind === "swot_analysis") {
    const typed = data as unknown as SwotVizData;
    const sections = [
      { title: "Strengths", items: typed.strengths, x: 90, y: 130, color: "#86efac" },
      { title: "Weaknesses", items: typed.weaknesses, x: 650, y: 130, color: "#fca5a5" },
      { title: "Opportunities", items: typed.opportunities, x: 90, y: 400, color: "#7dd3fc" },
      { title: "Threats", items: typed.threats, x: 650, y: 400, color: "#fde68a" },
    ];

    const body = sections
      .map((section) => {
        const lines = section.items.slice(0, 3).map((item, index) => {
          return `<text x="${section.x + 14}" y="${section.y + 64 + index * 28}" fill="#dbeafe" font-size="16">${escapeXml(item)}</text>`;
        });
        return [
          `<rect x="${section.x}" y="${section.y}" width="530" height="230" fill="rgba(15,23,42,0.42)" stroke="${section.color}" stroke-opacity="0.65" rx="14" />`,
          `<text x="${section.x + 14}" y="${section.y + 34}" fill="${section.color}" font-size="22" font-weight="700">${section.title}</text>`,
          ...lines,
        ].join("");
      })
      .join("");

    return frameSvg(result.frameworkName, "SWOT Analysis", body);
  }

  if (kind === "bcg_matrix") {
    const typed = data as unknown as BcgVizData;
    const points = typed.points.map((point) => ({
      label: point.label.length > 14 ? `${point.label.slice(0, 14)}…` : point.label,
      x: point.share,
      y: point.growth,
      size: point.size,
    }));
    return frameSvg(result.frameworkName, "Growth / Share Matrix", scatterBody(points, "Relative Market Share", "Market Growth"));
  }

  if (kind === "project_portfolio_matrix") {
    const typed = data as unknown as ProjectPortfolioVizData;
    const points = typed.points.map((point) => ({
      label: point.label.length > 14 ? `${point.label.slice(0, 14)}…` : point.label,
      x: point.risk,
      y: point.value,
      size: point.size,
    }));
    return frameSvg(result.frameworkName, "Portfolio Value vs Risk", scatterBody(points, "Risk", "Strategic Value"));
  }

  if (kind === "pareto_principle") {
    const typed = data as unknown as ParetoVizData;
    const rows = typed.factors.map((factor) => ({ label: factor.label, value: factor.contribution }));
    return frameSvg(result.frameworkName, "Pareto Contributions", barBody(rows, "Factors", "Contribution"));
  }

  if (kind === "hype_cycle") {
    const typed = data as unknown as HypeCycleVizData;
    const points = typed.phases.map((phase) => ({ label: phase.phase, x: phase.x, y: phase.y }));
    return frameSvg(result.frameworkName, "Hype Cycle", lineBody(points, "Maturity", "Expectations", typed.current.x));
  }

  if (kind === "chasm_diffusion_model") {
    const typed = data as unknown as ChasmVizData;
    const rows = typed.segments.map((segment) => ({ label: segment.segment, value: segment.adoption }));
    return frameSvg(result.frameworkName, "Diffusion / Chasm", barBody(rows, "Segment", "Adoption"));
  }

  if (kind === "monte_carlo_simulation") {
    const typed = data as unknown as MonteCarloVizData;
    const rows = typed.bins.map((bin) => ({
      label: `${Math.round(bin.binStart * 100)}-${Math.round(bin.binEnd * 100)}%`,
      value: bin.count,
    }));
    return frameSvg(result.frameworkName, "Outcome Distribution", barBody(rows, "Probability Bin", "Frequency"));
  }

  if (kind === "consequences_model") {
    const typed = data as unknown as ConsequencesVizData;
    const points = typed.horizons.map((horizon, index) => ({
      label: horizon.horizon,
      x: typed.horizons.length <= 1 ? 0.5 : index / Math.max(typed.horizons.length - 1, 1),
      y: horizon.direct,
    }));
    return frameSvg(result.frameworkName, "Consequences Over Time", lineBody(points, "Horizon", "Direct Impact"));
  }

  if (kind === "crossroads_model") {
    const typed = data as unknown as CrossroadsVizData;
    const points = typed.options.map((option) => ({
      label: option.option.length > 14 ? `${option.option.slice(0, 14)}…` : option.option,
      x: option.feasibility,
      y: option.desirability,
      size: option.size,
    }));
    return frameSvg(result.frameworkName, "Crossroads Options", scatterBody(points, "Feasibility", "Desirability"));
  }

  if (kind === "conflict_resolution_model") {
    const typed = data as unknown as ConflictResolutionVizData;
    const points = typed.modes.map((mode) => ({
      label: mode.mode,
      x: mode.assertiveness,
      y: mode.cooperativeness,
      size: 28 + mode.suitability * 40,
    }));
    return frameSvg(result.frameworkName, "Conflict Mode Map", scatterBody(points, "Assertiveness", "Cooperativeness"));
  }

  if (kind === "double_loop_learning") {
    const typed = data as unknown as DoubleLoopVizData;
    const lines = typed.loops.slice(0, 6).map((loop, index) => {
      return `<text x="48" y="${150 + index * 72}" fill="#dbeafe" font-size="18">• ${escapeXml(loop.behavior)} → ${escapeXml(
        loop.rootAssumption,
      )}</text>`;
    });
    return frameSvg(result.frameworkName, "Double-Loop Trace", lines.join(""));
  }

  return null;
}

export function renderFrameworkAssetSvg(result: FrameworkResult): string {
  return (
    renderTop12FrameworkSvg(result) ??
    cardSvg(result.frameworkName, "DecisionRoom Framework Snapshot", [
      `Applicability: ${(result.applicabilityScore * 100).toFixed(1)}%`,
      `Confidence: ${(result.confidence * 100).toFixed(1)}%`,
      `Top insight: ${result.insights[0] ?? "n/a"}`,
      `Top action: ${result.actions[0] ?? "n/a"}`,
      `Key risk: ${result.risks[0] ?? "n/a"}`,
    ])
  );
}

async function buildFrameworkAssets(
  decisionId: string,
  frameworkResults: FrameworkResult[],
): Promise<AssetRecord[]> {
  const assets: AssetRecord[] = [];

  for (const result of frameworkResults) {
    const basePath = `decision-${decisionId}/assets/${result.frameworkId}`;
    const svgPath = `${basePath}.svg`;
    const pngPath = `${basePath}.png`;

    const svgContent = renderFrameworkAssetSvg(result);

    const pngContent = await sharp(Buffer.from(svgContent)).png().toBuffer();

    assets.push({
      frameworkId: result.frameworkId,
      svgPath,
      pngPath,
      svgContent,
      pngContent,
    });
  }

  return assets;
}

async function buildMapAssets(
  decisionId: string,
  propagatedMap: PropagatedDecisionMap,
): Promise<{ svgPath: string; pngPath: string; svgContent: string; pngContent: Buffer }> {
  const svgPath = `decision-${decisionId}/assets/propagated-map.svg`;
  const pngPath = `decision-${decisionId}/assets/propagated-map.png`;

  const nodeLines = propagatedMap.nodes.slice(0, 14).map((node, index) => {
    return `${index + 1}. ${node.label} (${(node.applicabilityScore * 100).toFixed(0)}%)`;
  });

  const svgContent = cardSvg("Propagated Decision Map", "Node Summary", [
    `Framework nodes: ${propagatedMap.nodes.length}`,
    `Edges: ${propagatedMap.edges.length}`,
    `Consensus: ${propagatedMap.consensus.length}`,
    `Conflicts: ${propagatedMap.conflicts.length}`,
    ...nodeLines.slice(0, 2),
  ]);

  const pngContent = await sharp(Buffer.from(svgContent)).png().toBuffer();

  return {
    svgPath,
    pngPath,
    svgContent,
    pngContent,
  };
}

async function zipFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    const output = new PassThrough();
    const chunks: Buffer[] = [];

    output.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    output.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    archive.on("error", (error) => {
      reject(error);
    });

    archive.pipe(output);

    for (const file of files) {
      archive.append(file.content, { name: file.path });
    }

    void archive.finalize();
  });
}

export function buildMarkdownExport(input: BuildExportInput): {
  markdown: string;
  artifacts: Array<{ type: string; path: string; checksum: string }>;
} {
  const manifest: ExportManifest = {
    decisionId: input.decisionId,
    runId: input.runId,
    generatedAt: new Date().toISOString(),
    markdownPath: `decision-${input.decisionId}/report.md`,
    assets: [],
  };

  const markdown = renderMarkdownReport({
    decisionId: input.decisionId,
    runId: input.runId,
    brief: input.brief,
    frameworkResults: input.frameworkResults,
    propagatedMap: input.propagatedMap,
    synthesis: input.synthesis,
    manifest,
  });

  const path = manifest.markdownPath;

  return {
    markdown,
    artifacts: [
      {
        type: "markdown",
        path,
        checksum: sha1(markdown),
      },
    ],
  };
}

export async function buildZipExportBundle(input: BuildExportInput): Promise<{
  markdown: string;
  zip: Buffer;
  manifest: ExportManifest;
  artifacts: Array<{ type: string; path: string; checksum: string }>;
}> {
  const frameworkAssets = await buildFrameworkAssets(input.decisionId, input.frameworkResults);
  const mapAsset = await buildMapAssets(input.decisionId, input.propagatedMap);

  const manifest: ExportManifest = {
    decisionId: input.decisionId,
    runId: input.runId,
    generatedAt: new Date().toISOString(),
    markdownPath: `decision-${input.decisionId}/report.md`,
    assets: [
      ...frameworkAssets.map((asset) => ({
        frameworkId: asset.frameworkId,
        svgPath: asset.svgPath,
        pngPath: asset.pngPath,
      })),
      {
        frameworkId: "propagated-map",
        svgPath: mapAsset.svgPath,
        pngPath: mapAsset.pngPath,
      },
    ],
  };

  const markdown = renderMarkdownReport({
    decisionId: input.decisionId,
    runId: input.runId,
    brief: input.brief,
    frameworkResults: input.frameworkResults,
    propagatedMap: input.propagatedMap,
    synthesis: input.synthesis,
    manifest,
  });

  const files: Array<{ path: string; content: string | Buffer }> = [
    {
      path: manifest.markdownPath,
      content: markdown,
    },
    {
      path: `decision-${input.decisionId}/manifest.json`,
      content: JSON.stringify(manifest, null, 2),
    },
    {
      path: mapAsset.svgPath,
      content: mapAsset.svgContent,
    },
    {
      path: mapAsset.pngPath,
      content: mapAsset.pngContent,
    },
  ];

  for (const asset of frameworkAssets) {
    files.push({ path: asset.svgPath, content: asset.svgContent });
    files.push({ path: asset.pngPath, content: asset.pngContent });
  }

  const zip = await zipFiles(files);

  return {
    markdown,
    zip,
    manifest,
    artifacts: files.map((file) => ({
      type: file.path.endsWith(".md")
        ? "markdown"
        : file.path.endsWith(".json")
          ? "manifest"
          : file.path.endsWith(".svg")
            ? "svg"
            : "png",
      path: file.path,
      checksum: sha1(file.content),
    })),
  };
}
