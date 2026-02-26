import { motion } from "framer-motion";

import { FrameworkVisualization } from "@/components/FrameworkVisualization";
import { PropagatedGraph } from "@/components/PropagatedGraph";
import type { RecommendationViewProps } from "@/components/decision-studio/types";

export function RecommendationStep({
  results,
  recommendation,
  decisionId,
  showRelationshipMap,
  setShowRelationshipMap,
  activeFrameworkId,
  setActiveFrameworkId,
  showFrameworkPanels,
  setShowFrameworkPanels,
  displayedFrameworkResults,
  frameworkOptions,
}: RecommendationViewProps) {
  const fallbackCount = results.frameworkResults.filter(
    (framework) => framework.generation?.mode === "fallback",
  ).length;
  const warnings = results.synthesis.warnings ?? [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Decision Recommendation</h2>
          <p className="text-sm text-slate-300">
            Provider: {results.provider}
            {results.model ? ` (${results.model})` : ""} · Run: {results.runId} · Frameworks analyzed:{" "}
            {results.frameworkResults.length}
          </p>
        </div>
        <div className="flex gap-2">
          {decisionId ? (
            <>
              <a
                href={`/api/decisions/${decisionId}/export?format=md`}
                className="rounded-xl border border-slate-500 px-3 py-2 text-xs text-slate-100 hover:border-sky-400"
              >
                Export Markdown
              </a>
              <a
                href={`/api/decisions/${decisionId}/export?format=zip`}
                className="rounded-xl border border-slate-500 px-3 py-2 text-xs text-slate-100 hover:border-sky-400"
              >
                Export ZIP
              </a>
            </>
          ) : null}
        </div>
      </div>

      {fallbackCount > 0 || warnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">
            Analysis completed with fallback outputs ({fallbackCount} framework
            {fallbackCount === 1 ? "" : "s"}).
          </p>
          {warnings.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-amber-50">
              {warnings.slice(0, 8).map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {recommendation ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Recommended Option</p>
              <h3 className="mt-2 text-2xl font-semibold text-emerald-50">
                {recommendation.recommendedOption}
              </h3>
              <p className="mt-2 text-sm text-emerald-100">{recommendation.rationale}</p>
              <p className="mt-3 text-sm font-medium text-emerald-100">
                Confidence: {(recommendation.confidence * 100).toFixed(1)}%
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">Tradeoffs to watch</h3>
              <ul className="space-y-2 text-xs text-slate-200">
                {recommendation.tradeoffs.map((tradeoff) => (
                  <li key={tradeoff}>• {tradeoff}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">Option Scores</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs text-slate-200">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="pb-2">Option</th>
                      <th className="pb-2">Score</th>
                      <th className="pb-2">Confidence</th>
                      <th className="pb-2">Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendation.optionScores.map((option) => (
                      <tr key={option.option} className="border-t border-slate-800">
                        <td className="py-2 pr-3 font-medium text-slate-100">{option.option}</td>
                        <td className="py-2 pr-3">{(option.score * 100).toFixed(1)}%</td>
                        <td className="py-2 pr-3">{(option.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2 text-slate-300">{option.rationale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-100">Immediate next actions</h3>
              <ul className="space-y-2 text-xs text-slate-200">
                {recommendation.nextActions.map((action) => (
                  <li key={action}>• {action}</li>
                ))}
              </ul>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
          Decision recommendation is unavailable for this run. Re-run analysis with a healthy provider to
          generate option scoring.
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/65 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Framework Relationship View (Optional)</h3>
            <p className="text-xs text-slate-400">
              This is supporting evidence. You can skip it and use recommendation + option scores.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRelationshipMap((previous) => !previous)}
            className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200"
          >
            {showRelationshipMap ? "Hide relationship view" : "Show relationship view"}
          </button>
        </div>

        {showRelationshipMap ? (
          <PropagatedGraph
            map={results.propagatedMap}
            onNodeSelect={(frameworkId) => setActiveFrameworkId(frameworkId)}
          />
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <h3 className="mb-2 text-sm font-semibold text-emerald-100">
            Consensus ({results.propagatedMap.consensus.length})
          </h3>
          <ul className="space-y-1 text-xs text-emerald-50">
            {results.propagatedMap.consensus.slice(0, 6).map((edge) => (
              <li key={`${edge.source}-${edge.target}`}>• {edge.rationale}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
          <h3 className="mb-2 text-sm font-semibold text-rose-100">
            Conflicts ({results.propagatedMap.conflicts.length})
          </h3>
          <ul className="space-y-1 text-xs text-rose-50">
            {results.propagatedMap.conflicts.slice(0, 6).map((edge) => (
              <li key={`${edge.source}-${edge.target}`}>• {edge.rationale}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-100">Framework Evidence</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>
              {activeFrameworkId
                ? `Filtered by: ${
                    frameworkOptions.find((option) => option.id === activeFrameworkId)?.name ??
                    activeFrameworkId
                  }`
                : "Showing top frameworks"}
            </span>
            <button
              type="button"
              onClick={() => setShowFrameworkPanels((previous) => !previous)}
              className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200"
            >
              {showFrameworkPanels ? "Show less" : "Show all"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {displayedFrameworkResults.map((result) => (
            <motion.article
              key={result.frameworkId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/65 p-4"
            >
              <header className="space-y-1">
                <h4 className="text-base font-semibold text-slate-100">{result.frameworkName}</h4>
                <p className="text-xs text-slate-400">
                  {result.frameworkId} · confidence {(result.confidence * 100).toFixed(1)}%
                </p>
              </header>

              <FrameworkVisualization result={result} />

              <div className="grid gap-3 text-xs text-slate-200 md:grid-cols-3">
                <div>
                  <p className="mb-1 font-semibold text-slate-100">Insights</p>
                  <ul className="space-y-1">
                    {result.insights.slice(0, 3).map((insight) => (
                      <li key={insight}>• {insight}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-1 font-semibold text-slate-100">Actions</p>
                  <ul className="space-y-1">
                    {result.actions.slice(0, 3).map((action) => (
                      <li key={action}>• {action}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="mb-1 font-semibold text-slate-100">Risks</p>
                  <ul className="space-y-1">
                    {result.risks.slice(0, 3).map((risk) => (
                      <li key={risk}>• {risk}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </section>
    </motion.section>
  );
}
