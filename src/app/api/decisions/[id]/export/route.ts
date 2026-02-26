import { ZodError } from "zod";

import { getDecisionWithLatestBrief, getLatestCompleteRun } from "@/lib/decisions";
import { prisma } from "@/lib/db";
import { buildMarkdownExport, buildZipExportBundle } from "@/lib/export/bundle";
import { badRequest, handleRouteError, notFound } from "@/lib/http";
import { decisionBriefSchema, frameworkResultSchema } from "@/lib/schemas";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const decision = await getDecisionWithLatestBrief(id);

    if (!decision) {
      return notFound(`Decision ${id} not found`);
    }

    const briefRecord = decision.briefs[0];
    if (!briefRecord) {
      return badRequest("Decision brief missing. Run refinement first.");
    }

    const run = await getLatestCompleteRun(id);
    if (!run || !run.propagatedMap || !run.synthesis) {
      return badRequest("Completed analysis run with synthesis is required before export.");
    }

    const format = new URL(request.url).searchParams.get("format") ?? "md";
    if (!["md", "zip"].includes(format)) {
      return badRequest("Invalid export format. Use format=md or format=zip.");
    }

    const brief = decisionBriefSchema.parse(briefRecord.briefJson);
    const frameworkResults = run.frameworkResults.map((record) => frameworkResultSchema.parse(record.resultJson));

    if (format === "md") {
      const bundle = buildMarkdownExport({
        decisionId: id,
        runId: run.id,
        brief,
        frameworkResults,
        propagatedMap: run.propagatedMap as unknown as Parameters<
          typeof buildMarkdownExport
        >[0]["propagatedMap"],
        synthesis: run.synthesis as unknown as Parameters<typeof buildMarkdownExport>[0]["synthesis"],
      });

      await prisma.$transaction(async (transaction) => {
        await transaction.exportArtifact.deleteMany({ where: { runId: run.id, type: "markdown" } });
        await transaction.exportArtifact.createMany({
          data: bundle.artifacts.map((artifact) => ({
            runId: run.id,
            type: artifact.type,
            path: artifact.path,
            checksum: artifact.checksum,
          })),
        });
      });

      return new Response(bundle.markdown, {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename=decision-${id}.md`,
        },
      });
    }

    const bundle = await buildZipExportBundle({
      decisionId: id,
      runId: run.id,
      brief,
      frameworkResults,
      propagatedMap: run.propagatedMap as unknown as Parameters<
        typeof buildZipExportBundle
      >[0]["propagatedMap"],
      synthesis: run.synthesis as unknown as Parameters<typeof buildZipExportBundle>[0]["synthesis"],
    });

    await prisma.$transaction(async (transaction) => {
      await transaction.exportArtifact.deleteMany({ where: { runId: run.id } });
      await transaction.exportArtifact.createMany({
        data: bundle.artifacts.map((artifact) => ({
          runId: run.id,
          type: artifact.type,
          path: artifact.path,
          checksum: artifact.checksum,
        })),
      });
    });

    return new Response(new Uint8Array(bundle.zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename=decision-${id}.zip`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequest("Export data validation failed", error.flatten());
    }

    return handleRouteError(error, "Failed to export decision report");
  }
}
