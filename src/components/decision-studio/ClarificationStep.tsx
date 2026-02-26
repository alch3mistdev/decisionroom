import type { ClarificationQuestion, CreateDecisionInput } from "@/lib/types";

interface ClarificationStepProps {
  decisionId: string | null;
  form: CreateDecisionInput;
  questions: ClarificationQuestion[];
  answers: Record<string, string>;
  answeredQuestionCount: number;
  busy: string | null;
  onGenerateQuestions: () => Promise<void>;
  onAutofillAnswers: () => Promise<void>;
  onSubmitAnswers: () => Promise<void>;
  onUpdateAnswer: (questionId: string, answer: string) => void;
  contextAlternatives: string[];
  contextConstraints: string[];
  contextStakeholders: string[];
  contextSuccessCriteria: string[];
}

export function ClarificationStep({
  decisionId,
  form,
  questions,
  answers,
  answeredQuestionCount,
  busy,
  onGenerateQuestions,
  onAutofillAnswers,
  onSubmitAnswers,
  onUpdateAnswer,
  contextAlternatives,
  contextConstraints,
  contextStakeholders,
  contextSuccessCriteria,
}: ClarificationStepProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">2. Clarification</h2>
        <span className="text-xs text-slate-400">
          {answeredQuestionCount}/{questions.length || 0} answered
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerateQuestions}
          disabled={!decisionId || busy === "questions"}
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-100 transition hover:border-sky-400 disabled:opacity-60"
        >
          {busy === "questions" ? "Generating..." : "Regenerate Questions"}
        </button>
        <button
          type="button"
          onClick={onAutofillAnswers}
          disabled={questions.length === 0 || busy === "autofill"}
          className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-100 transition hover:border-sky-400 disabled:opacity-60"
        >
          {busy === "autofill" ? "Generating suggestions..." : "Auto-fill blanks"}
        </button>
        <button
          type="button"
          onClick={onSubmitAnswers}
          disabled={!decisionId || questions.length === 0 || busy === "brief"}
          className="rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {busy === "brief" ? "Building Brief..." : "Build Brief"}
        </button>
      </div>

      {decisionId ? (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Decision Context Snapshot
          </h3>
          <p className="text-sm text-slate-100">{form.prompt || "No decision statement captured."}</p>
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="mb-1 font-semibold text-slate-200">Alternatives</p>
              {contextAlternatives.length > 0 ? (
                <ul className="space-y-1 text-slate-300">
                  {contextAlternatives.slice(0, 4).map((option) => (
                    <li key={option}>• {option}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No alternatives provided yet.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="mb-1 font-semibold text-slate-200">Success Criteria</p>
              {contextSuccessCriteria.length > 0 ? (
                <ul className="space-y-1 text-slate-300">
                  {contextSuccessCriteria.slice(0, 4).map((criterion) => (
                    <li key={criterion}>• {criterion}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No success criteria provided yet.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="mb-1 font-semibold text-slate-200">Constraints</p>
              {contextConstraints.length > 0 ? (
                <ul className="space-y-1 text-slate-300">
                  {contextConstraints.slice(0, 4).map((constraint) => (
                    <li key={constraint}>• {constraint}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No constraints provided yet.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-slate-300">
              <p className="mb-1 font-semibold text-slate-200">Meta</p>
              <p>Deadline: {form.deadline?.trim() || "Not set"}</p>
              <p>Risk tolerance: {form.riskTolerance ?? "medium"}</p>
              <p>
                Stakeholders:{" "}
                {contextStakeholders.length > 0
                  ? contextStakeholders.slice(0, 3).join(", ")
                  : "Not set"}
              </p>
              <p>Budget: {form.budget?.trim() || "Not set"}</p>
            </div>
          </div>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <p className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-300">
          Create a decision first. Clarification questions will be generated automatically.
        </p>
      ) : (
        <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
          {questions.map((question) => (
            <div key={question.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
              <p className="text-sm font-medium text-slate-100">{question.question}</p>
              <p className="mt-1 text-xs text-slate-400">{question.rationale}</p>
              <textarea
                className="mt-2 min-h-[74px] w-full rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-1 text-sm text-slate-100"
                placeholder="Answer"
                value={answers[question.id] ?? ""}
                onChange={(event) => onUpdateAnswer(question.id, event.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
