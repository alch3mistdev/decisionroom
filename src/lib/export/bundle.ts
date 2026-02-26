import { PassThrough } from "node:stream";

import archiver from "archiver";
import sharp from "sharp";

import { renderMarkdownReport } from "@/lib/export/markdown";
import { sha1 } from "@/lib/utils/hash";
import type {
  DecisionBrief,
  ExportManifest,
  FrameworkResult,
  PropagatedDecisionMap,
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

async function buildFrameworkAssets(
  decisionId: string,
  frameworkResults: FrameworkResult[],
): Promise<AssetRecord[]> {
  const assets: AssetRecord[] = [];

  for (const result of frameworkResults) {
    const basePath = `decision-${decisionId}/assets/${result.frameworkId}`;
    const svgPath = `${basePath}.svg`;
    const pngPath = `${basePath}.png`;

    const svgContent = cardSvg(result.frameworkName, "DecisionRoom Framework Snapshot", [
      `Applicability: ${(result.applicabilityScore * 100).toFixed(1)}%`,
      `Confidence: ${(result.confidence * 100).toFixed(1)}%`,
      `Top insight: ${result.insights[0] ?? "n/a"}`,
      `Top action: ${result.actions[0] ?? "n/a"}`,
      `Key risk: ${result.risks[0] ?? "n/a"}`,
    ]);

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
