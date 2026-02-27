import type { AnalysisStepProps } from "@/components/decision-studio/types";

const MIN_BRIEF_QUALITY = 0.67;

export function AnalysisStep({
  brief,
  briefQualityScore,
  providerPreference,
  setProviderPreference,
  rankedFrameworkFits,
  selectedFrameworkIds,
  setSelectedFrameworkIds,
  selectedFrameworkArray,
  showFrameworkSelector,
  setShowFrameworkSelector,
  busy,
  decisionId,
  runStatus,
  onStartAnalysis,
}: AnalysisStepProps) {
  const qualityBlocked =
    typeof briefQualityScore === "number" && briefQualityScore < MIN_BRIEF_QUALITY;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
      <h2 className="text-lg font-semibold text-slate-100">4. Analysis Setup</h2>

      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">
        <p className="font-semibold text-slate-100">Brief quality gate</p>
        <p className="mt-1">
          Score: {typeof briefQualityScore === "number" ? `${Math.round(briefQualityScore * 100)}%` : "n/a"}{" "}
          (minimum {Math.round(MIN_BRIEF_QUALITY * 100)}%)
        </p>
        {qualityBlocked ? (
          <p className="mt-1 text-amber-200">
            Improve clarification quality before running analysis.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedFrameworkIds(new Set(rankedFrameworkFits.slice(0, 4).map((fit) => fit.id)))}
          className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200"
        >
          Top 4 Fit (default)
        </button>
        <button
          type="button"
          onClick={() => setSelectedFrameworkIds(new Set(rankedFrameworkFits.slice(0, 12).map((fit) => fit.id)))}
          className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200"
        >
          Top 12 Fit
        </button>
        <button
          type="button"
          onClick={() => setSelectedFrameworkIds(new Set(rankedFrameworkFits.map((fit) => fit.id)))}
          className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200"
        >
          All 50
        </button>
        <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
          {selectedFrameworkArray.length} selected
        </span>
      </div>
      <p className="text-xs text-slate-400">
        Ranked by fit to your brief. Default is top 4; you can manually choose any frameworks.
      </p>

      <label className="block text-xs font-medium uppercase tracking-wide text-slate-300">
        Provider preference
        <select
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
          value={providerPreference}
          onChange={(event) => setProviderPreference(event.target.value as typeof providerPreference)}
        >
          <option value="auto">Auto (env priority)</option>
          <option value="local">Local only (Ollama)</option>
          <option value="hosted">Hosted only (Anthropic)</option>
        </select>
      </label>

      <button
        type="button"
        onClick={() => setShowFrameworkSelector((previous) => !previous)}
        className="block w-fit text-xs text-slate-300 underline underline-offset-4"
      >
        {showFrameworkSelector ? "Hide detailed framework picker" : "Show detailed framework picker"}
      </button>

      {showFrameworkSelector ? (
        <div className="max-h-[260px] space-y-1 overflow-auto rounded-xl border border-slate-700 bg-slate-950/60 p-2">
          {rankedFrameworkFits.map((fit) => {
            const selected = selectedFrameworkIds.has(fit.id);

            return (
              <label
                key={fit.id}
                className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-slate-800/70"
              >
                <span className="min-w-0">
                  <span className="truncate">{fit.name}</span>
                  {fit.deepSupported ? (
                    <span className="ml-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
                      deep
                    </span>
                  ) : null}
                  <span className="ml-2 text-[10px] text-slate-400">
                    #{fit.rank} · fit {Math.round(fit.fitScore * 100)}%
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    setSelectedFrameworkIds((prev) => {
                      const next = new Set(prev);
                      if (selected) {
                        next.delete(fit.id);
                      } else {
                        next.add(fit.id);
                      }
                      return next;
                    });
                  }}
                />
              </label>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onStartAnalysis}
        disabled={!decisionId || busy === "analyze" || qualityBlocked}
        className="mt-2 w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60 sm:w-auto"
      >
        {busy === "analyze" ? "Starting analysis..." : "Run Analysis"}
      </button>

      {runStatus ? (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">
          <p>
            Provider: {runStatus.provider}
            {runStatus.model ? ` (${runStatus.model})` : ""}
          </p>
          <p>Status: {runStatus.status}</p>
          <p>
            Progress: {runStatus.completedFrameworkCount}/{runStatus.frameworkCount}
          </p>
          {runStatus.error ? <p className="text-rose-200">Error: {runStatus.error}</p> : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Brief Summary</h3>
        <p className="mt-2 text-sm text-slate-300">{brief.decisionStatement}</p>
      </div>
    </div>
  );
}
