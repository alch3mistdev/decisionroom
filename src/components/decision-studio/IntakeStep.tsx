import type React from "react";

import type { CreateDecisionInput } from "@/lib/types";

interface IntakeStepProps {
  form: CreateDecisionInput;
  setForm: React.Dispatch<React.SetStateAction<CreateDecisionInput>>;
  showAdvancedIntake: boolean;
  setShowAdvancedIntake: React.Dispatch<React.SetStateAction<boolean>>;
  onLoadSample: () => void;
}

export function IntakeStep({
  form,
  setForm,
  showAdvancedIntake,
  setShowAdvancedIntake,
  onLoadSample,
}: IntakeStepProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">1. Decision Intake</h2>
        <button
          type="button"
          onClick={onLoadSample}
          className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-sky-400"
        >
          Load sample
        </button>
      </div>

      <label className="block text-xs font-medium uppercase tracking-wide text-slate-300">
        Decision Prompt
        <textarea
          className="mt-2 min-h-[130px] w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-400/50 transition focus:ring"
          placeholder="What decision are you trying to make, and why now?"
          value={form.prompt}
          onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
        />
      </label>

      <label className="block text-xs font-medium uppercase tracking-wide text-slate-300">
        Alternatives (one per line)
        <textarea
          className="mt-2 min-h-[90px] w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-400/50 transition focus:ring"
          placeholder="Option A\nOption B\nOption C"
          value={form.alternatives ?? ""}
          onChange={(event) => setForm((prev) => ({ ...prev, alternatives: event.target.value }))}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
          placeholder="Success criteria"
          value={form.successCriteria ?? ""}
          onChange={(event) => setForm((prev) => ({ ...prev, successCriteria: event.target.value }))}
        />
        <input
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
          placeholder="Stakeholders"
          value={form.stakeholders ?? ""}
          onChange={(event) => setForm((prev) => ({ ...prev, stakeholders: event.target.value }))}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvancedIntake((previous) => !previous)}
        className="text-xs text-slate-300 underline underline-offset-4"
      >
        {showAdvancedIntake ? "Hide advanced inputs" : "Show advanced inputs"}
      </button>

      {showAdvancedIntake ? (
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
            placeholder="Title"
            value={form.title ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
            placeholder="Deadline"
            value={form.deadline ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))}
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
            placeholder="Constraints"
            value={form.constraints ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, constraints: event.target.value }))}
          />
          <select
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
            value={form.riskTolerance ?? "medium"}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                riskTolerance: event.target.value as CreateDecisionInput["riskTolerance"],
              }))
            }
          >
            <option value="low">Risk tolerance: low</option>
            <option value="medium">Risk tolerance: medium</option>
            <option value="high">Risk tolerance: high</option>
          </select>
          <input
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
            placeholder="Budget"
            value={form.budget ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, budget: event.target.value }))}
          />
          <input
            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
            placeholder="Time limit"
            value={form.timeLimit ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, timeLimit: event.target.value }))}
          />
        </div>
      ) : null}
    </div>
  );
}
