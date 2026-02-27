"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { AnalysisStep } from "@/components/decision-studio/AnalysisStep";
import { ClarificationStep } from "@/components/decision-studio/ClarificationStep";
import { IntakeStep } from "@/components/decision-studio/IntakeStep";
import { RecommendationStep } from "@/components/decision-studio/RecommendationStep";
import type {
  DecisionDetailPayload,
  ResultsPayload,
} from "@/components/decision-studio/types";
import { rankFrameworkFitsForBrief } from "@/lib/frameworks/fit-ranking";
import { listFrameworkDefinitions } from "@/lib/frameworks/registry";
import { ApiError, fetchJson } from "@/lib/client/api";
import type {
  ClarificationQuestion,
  CreateDecisionInput,
  DecisionRecommendation,
  DecisionBrief,
  DecisionRunStatus,
  FrameworkId,
  ProviderPreference,
} from "@/lib/types";

interface Props {
  initialDecisionId?: string;
}

type Stage = "intake" | "clarify" | "analyze" | "results";

const MIN_ANSWER_COUNT = 3;
const MIN_BRIEF_QUALITY = 0.67;

const initialForm: CreateDecisionInput = {
  prompt: "",
  alternatives: "",
  constraints: "",
  deadline: "",
  stakeholders: "",
  successCriteria: "",
  riskTolerance: "medium",
  budget: "",
  timeLimit: "",
};

const sampleForm: CreateDecisionInput = {
  title: "AI support assistant launch decision",
  prompt:
    "Should we launch an AI support assistant this quarter for enterprise customers, or delay and harden our data and operations first?",
  alternatives:
    "Launch to all enterprise customers this quarter\nRun a phased pilot with 3 design partners\nDelay launch for one quarter to improve reliability",
  constraints: "No SOC2 risk\nNo increase in support headcount\nMust protect CSAT",
  deadline: "End of current quarter",
  stakeholders: "Support leadership, Security, Enterprise Success, Product",
  successCriteria:
    "Reduce average handle time by 20%\nIncrease first-contact resolution by 10%\nNo CSAT regression",
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
};

const frameworkOptions = listFrameworkDefinitions();

function splitInputList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFallbackAutofillAnswer(question: ClarificationQuestion, form: CreateDecisionInput): string {
  const key = question.question.toLowerCase();
  const decisionSummary = form.prompt.trim().slice(0, 180);

  if (key.includes("alternative") || key.includes("option")) {
    const options = splitInputList(form.alternatives).slice(0, 3);
    if (options.length >= 2) {
      return `I would evaluate ${options.join(", ")} and prioritize the one with strongest upside-to-risk balance after a short pilot.`;
    }
    return "I would compare at least a conservative, phased, and aggressive option, then choose based on measurable early results.";
  }

  if (key.includes("constraint")) {
    const constraints = splitInputList(form.constraints).slice(0, 3);
    if (constraints.length > 0) {
      return `Hard constraints are ${constraints.join(", ")}; any option violating one should be excluded immediately.`;
    }
    return "Maintain compliance and avoid customer disruption while preserving execution capacity.";
  }

  if (key.includes("stakeholder")) {
    const stakeholders = splitInputList(form.stakeholders).slice(0, 4);
    if (stakeholders.length > 0) {
      return `Primary stakeholders are ${stakeholders.join(", ")}; I would align on decision criteria and ownership before execution.`;
    }
    return "Primary stakeholders should include the decision owner, delivery team, and impacted users.";
  }

  if (key.includes("success")) {
    const criteria = splitInputList(form.successCriteria).slice(0, 3);
    if (criteria.length > 0) {
      return `Success should be measured by ${criteria.join(", ")} with baseline and target thresholds agreed upfront.`;
    }
    return "Success means measurable KPI improvement within the planned timeline.";
  }

  if (key.includes("deadline") || key.includes("timeline")) {
    return form.deadline?.trim() || form.timeLimit?.trim() || "Complete within one quarter.";
  }

  if (key.includes("risk")) {
    return `Current risk tolerance is ${form.riskTolerance ?? "medium"}.`;
  }

  if (key.includes("budget") || key.includes("resource")) {
    const meta = [form.budget?.trim(), form.timeLimit?.trim()].filter(Boolean);
    if (meta.length > 0) {
      return `Use ${meta.join(" and ")} as operating limits and keep contingency for mitigation after first milestone.`;
    }
    return "Work within existing team capacity and reserve buffer for risk mitigation.";
  }

  return `Given the current decision context (${decisionSummary}), I would choose the most testable option and validate it against constraints before scaling.`;
}

function deriveStage(
  decisionId: string | null,
  brief: DecisionBrief | null,
  results: ResultsPayload | null,
  runStatus: DecisionRunStatus | null,
): Stage {
  if (results) {
    return "results";
  }

  if (runStatus && ["queued", "analyzing", "synthesizing"].includes(runStatus.status)) {
    return "analyze";
  }

  if (brief) {
    return "analyze";
  }

  if (decisionId) {
    return "clarify";
  }

  return "intake";
}

function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "PROVIDER_UNAVAILABLE") {
      return `${error.message} Configure ANTHROPIC_API_KEY or run Ollama locally before continuing.`;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected request failure";
}

export function DecisionStudio({ initialDecisionId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CreateDecisionInput>(initialForm);
  const [decisionId, setDecisionId] = useState<string | null>(initialDecisionId ?? null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [brief, setBrief] = useState<DecisionBrief | null>(null);
  const [briefQualityScore, setBriefQualityScore] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<DecisionRunStatus | null>(null);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [providerPreference, setProviderPreference] = useState<ProviderPreference>("auto");
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<Set<FrameworkId>>(
    () => new Set<FrameworkId>(),
  );
  const [activeFrameworkId, setActiveFrameworkId] = useState<FrameworkId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedIntake, setShowAdvancedIntake] = useState(false);
  const [showFrameworkSelector, setShowFrameworkSelector] = useState(false);
  const [showFrameworkPanels, setShowFrameworkPanels] = useState(false);
  const [showRelationshipMap, setShowRelationshipMap] = useState(false);
  const [briefElapsedSeconds, setBriefElapsedSeconds] = useState(0);
  const lastAutoSelectionBriefSignature = useRef<string | null>(null);

  const selectedFrameworkArray = useMemo(
    () => Array.from(selectedFrameworkIds.values()),
    [selectedFrameworkIds],
  );

  const rankedFrameworkFits = useMemo(
    () => (brief ? rankFrameworkFitsForBrief(brief, frameworkOptions) : []),
    [brief],
  );

  const briefSelectionSignature = useMemo(() => {
    if (!brief) {
      return null;
    }

    return JSON.stringify(brief);
  }, [brief]);

  const stage = deriveStage(decisionId, brief, results, runStatus);

  const answeredQuestionCount = useMemo(
    () =>
      questions.filter((question) => {
        const value = answers[question.id];
        return Boolean(value && value.trim().length > 0);
      }).length,
    [answers, questions],
  );

  const recommendation = useMemo<DecisionRecommendation | null>(
    () => results?.synthesis.decisionRecommendation ?? null,
    [results],
  );

  const contextAlternatives = useMemo(() => splitInputList(form.alternatives), [form.alternatives]);
  const contextConstraints = useMemo(() => splitInputList(form.constraints), [form.constraints]);
  const contextStakeholders = useMemo(() => splitInputList(form.stakeholders), [form.stakeholders]);
  const contextSuccessCriteria = useMemo(() => splitInputList(form.successCriteria), [form.successCriteria]);

  const displayedFrameworkResults = useMemo(() => {
    if (!results) {
      return [];
    }

    const sorted = [...results.frameworkResults].sort(
      (a, b) => b.applicabilityScore - a.applicabilityScore,
    );

    if (activeFrameworkId) {
      return sorted.filter((result) => result.frameworkId === activeFrameworkId);
    }

    if (!showFrameworkPanels) {
      return sorted.slice(0, 4);
    }

    return sorted;
  }, [activeFrameworkId, results, showFrameworkPanels]);

  useEffect(() => {
    if (!briefSelectionSignature || rankedFrameworkFits.length === 0) {
      return;
    }

    if (lastAutoSelectionBriefSignature.current === briefSelectionSignature) {
      return;
    }

    setSelectedFrameworkIds(
      new Set<FrameworkId>(rankedFrameworkFits.slice(0, 4).map((framework) => framework.id)),
    );
    lastAutoSelectionBriefSignature.current = briefSelectionSignature;
  }, [briefSelectionSignature, rankedFrameworkFits]);

  const loadResults = useCallback(async (targetDecisionId: string) => {
    const payload = await fetchJson<ResultsPayload>(`/api/decisions/${targetDecisionId}/results`);
    setResults(payload);
    setBrief(payload.brief);
    setRunId(payload.runId);
    setRunStatus((previous) =>
      previous
        ? {
            ...previous,
            provider: payload.provider,
            model: payload.model,
            status: "complete",
            completedFrameworkCount: payload.frameworkResults.length,
          }
        : null,
    );
  }, []);

  const generateQuestionsForDecision = useCallback(
    async (targetDecisionId: string, useBusyState = true) => {
      if (useBusyState) {
        setBusy("questions");
      }
      setError(null);

      try {
        const payload = await fetchJson<{ questions: ClarificationQuestion[] }>(
          `/api/decisions/${targetDecisionId}/refine`,
          {
            method: "POST",
            body: JSON.stringify({ mode: "generate_questions" }),
          },
        );

        setQuestions(payload.questions);
        setAnswers(
          payload.questions.reduce<Record<string, string>>((acc, question) => {
            acc[question.id] = "";
            return acc;
          }, {}),
        );
      } catch (questionError) {
        setError(getApiErrorMessage(questionError));
      } finally {
        if (useBusyState) {
          setBusy(null);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialDecisionId) {
      return;
    }

    let cancelled = false;

    void fetchJson<DecisionDetailPayload>(`/api/decisions/${initialDecisionId}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDecisionId(payload.decision.id);
        setForm((previous) => ({
          ...previous,
          ...payload.decision.input,
        }));
        setBriefQualityScore(payload.briefQualityScore);
        if (payload.brief) {
          setBrief(payload.brief);
        }

        if (payload.clarifications) {
          setQuestions(
            payload.clarifications.questions.map((question) => ({
              id: question.id,
              question: question.question,
              rationale: question.rationale,
              generationId: payload.clarifications?.generationId,
              sequence: question.sequence,
            })),
          );
          setAnswers(
            payload.clarifications.questions.reduce<Record<string, string>>((acc, question) => {
              acc[question.id] = question.answer ?? "";
              return acc;
            }, {}),
          );
        }

        if (payload.latestRun) {
          setRunStatus(payload.latestRun);
          setRunId(payload.latestRun.runId);
          if (payload.latestRun.status === "complete") {
            void loadResults(payload.latestRun.decisionId);
          }
        }
      })
      .catch(() => {
        // Keep current state if decision context fetch fails.
      });

    return () => {
      cancelled = true;
    };
  }, [initialDecisionId, loadResults]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let mounted = true;
    const timer = setInterval(() => {
      void fetchJson<DecisionRunStatus>(`/api/runs/${runId}`)
        .then(async (snapshot) => {
          if (!mounted) {
            return;
          }

          setRunStatus(snapshot);

          if (snapshot.status === "complete" && decisionId) {
            clearInterval(timer);
            await loadResults(decisionId);
          }

          if (snapshot.status === "failed") {
            clearInterval(timer);
            setError(snapshot.error ?? "Analysis run failed");
          }
        })
        .catch((pollError) => {
          if (!mounted) {
            return;
          }
          clearInterval(timer);
          setError(getApiErrorMessage(pollError));
        });
    }, 1500);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [decisionId, loadResults, runId]);

  useEffect(() => {
    if (busy !== "brief") {
      setBriefElapsedSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setBriefElapsedSeconds((previous) => previous + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [busy]);

  const waitForBriefFromContext = useCallback(
    async (targetDecisionId: string, timeoutMs = 45000): Promise<boolean> => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        try {
          const payload = await fetchJson<DecisionDetailPayload>(`/api/decisions/${targetDecisionId}`);
          if (payload.brief) {
            setBrief(payload.brief);
            setBriefQualityScore(payload.briefQualityScore);
            return true;
          }
        } catch {
          // Keep polling through transient fetch failures.
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return false;
    },
    [],
  );

  const onCreateDecision = async () => {
    if (!form.prompt.trim()) {
      setError("Decision prompt is required.");
      return;
    }

    setBusy("create");
    setError(null);

    try {
      const payload = await fetchJson<{ decisionId: string }>("/api/decisions", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setDecisionId(payload.decisionId);
      setQuestions([]);
      setAnswers({});
      setBrief(null);
      setBriefQualityScore(null);
      setResults(null);
      setRunId(null);
      setRunStatus(null);
      setActiveFrameworkId(null);
      router.replace(`/decision/${payload.decisionId}`);

      await generateQuestionsForDecision(payload.decisionId, false);
    } catch (createError) {
      setError(getApiErrorMessage(createError));
    } finally {
      setBusy(null);
    }
  };

  const onGenerateQuestions = async () => {
    if (!decisionId) {
      return;
    }

    await generateQuestionsForDecision(decisionId, true);
  };

  const onAutofillAnswers = async () => {
    if (!decisionId || questions.length === 0) {
      return;
    }

    setBusy("autofill");
    setError(null);

    try {
      const payload = await fetchJson<{ suggestions: Array<{ id: string; answer: string }> }>(
        `/api/decisions/${decisionId}/refine`,
        {
          method: "POST",
          body: JSON.stringify({
            mode: "suggest_answers",
            questions,
          }),
        },
      );

      const suggestionMap = new Map(
        payload.suggestions
          .map((suggestion) => [suggestion.id, suggestion.answer.trim()] as const)
          .filter(([, answer]) => answer.length > 0),
      );

      setAnswers((previous) => {
        const next = { ...previous };

        for (const question of questions) {
          if (!next[question.id] || next[question.id].trim().length === 0) {
            next[question.id] = suggestionMap.get(question.id) ?? getFallbackAutofillAnswer(question, form);
          }
        }

        return next;
      });
    } catch (error) {
      setError(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const onSubmitAnswers = async () => {
    if (!decisionId) {
      setError("Create a decision first.");
      return;
    }

    if (questions.length === 0) {
      await onGenerateQuestions();
      return;
    }

    const answersPayload = questions
      .map((question) => ({
        id: question.id,
        answer: answers[question.id]?.trim() ?? "",
      }))
      .filter((answer) => answer.answer.length > 0);

    if (answersPayload.length < MIN_ANSWER_COUNT) {
      setError(`Answer at least ${MIN_ANSWER_COUNT} clarification questions before building the brief.`);
      return;
    }

    setBusy("brief");
    setError(null);

    try {
      const payload = await fetchJson<{ decisionBrief: DecisionBrief; qualityScore: number }>(
        `/api/decisions/${decisionId}/refine`,
        {
          method: "POST",
          body: JSON.stringify({
            mode: "submit_answers",
            answers: answersPayload,
          }),
        },
      );

      setBrief(payload.decisionBrief);
      setBriefQualityScore(payload.qualityScore);
    } catch (briefError) {
      if (briefError instanceof ApiError && briefError.status === 504) {
        setError(
          "Brief generation is taking longer than the gateway timeout. Waiting for completion...",
        );

        const recovered = await waitForBriefFromContext(decisionId, 60000);
        if (recovered) {
          setError(null);
          return;
        }

        setError(
          "Brief generation timed out at the gateway. Try again, or switch provider preference before retrying.",
        );
      } else {
        setError(getApiErrorMessage(briefError));
      }
    } finally {
      setBusy(null);
    }
  };

  const onStartAnalysis = async () => {
    if (!decisionId) {
      setError("Create a decision first.");
      return;
    }

    if (selectedFrameworkArray.length === 0) {
      setError("Select at least one framework.");
      return;
    }

    if (typeof briefQualityScore === "number" && briefQualityScore < MIN_BRIEF_QUALITY) {
      setError(
        `Brief quality is ${(briefQualityScore * 100).toFixed(0)}%. Improve it to at least ${Math.round(
          MIN_BRIEF_QUALITY * 100,
        )}% before analysis.`,
      );
      return;
    }

    setBusy("analyze");
    setError(null);

    try {
      const payload = await fetchJson<{
        runId: string;
        provider: string;
        model: string | null;
      }>(`/api/decisions/${decisionId}/analyze`, {
        method: "POST",
        body: JSON.stringify({
          frameworkIds: selectedFrameworkArray,
          providerPreference,
        }),
      });

      setRunId(payload.runId);
      setRunStatus({
        runId: payload.runId,
        decisionId,
        provider: payload.provider,
        model: payload.model,
        status: "queued",
        error: null,
        startedAt: null,
        endedAt: null,
        frameworkCount: selectedFrameworkArray.length,
        completedFrameworkCount: 0,
      });
      setResults(null);
    } catch (analysisError) {
      setError(getApiErrorMessage(analysisError));
    } finally {
      setBusy(null);
    }
  };

  const onExecuteNextStep = async () => {
    if (stage === "intake") {
      await onCreateDecision();
      return;
    }

    if (stage === "clarify") {
      if (questions.length === 0) {
        await onGenerateQuestions();
      } else {
        await onSubmitAnswers();
      }
      return;
    }

    if (stage === "analyze") {
      await onStartAnalysis();
      return;
    }

    setShowFrameworkPanels((previous) => !previous);
  };

  const nextStepMeta =
    stage === "intake"
      ? {
          title: "Step 1 of 4: Define the decision",
          description:
            "Enter the decision and concrete alternatives. Then DecisionRoom will generate clarifying questions.",
          action: busy === "create" ? "Creating..." : "Create Decision + Start Clarification",
        }
      : stage === "clarify"
        ? {
            title: "Step 2 of 4: Clarify and tighten the brief",
            description:
              questions.length === 0
                ? "Generate guided follow-up questions to close information gaps."
                : `Answer key clarification questions (${answeredQuestionCount}/${questions.length} answered; minimum ${MIN_ANSWER_COUNT}).`,
            action:
              questions.length === 0
                ? busy === "questions"
                  ? "Generating..."
                  : "Generate Questions"
                : busy === "brief"
                  ? "Building Brief..."
                  : "Build Decision Brief",
          }
        : stage === "analyze"
          ? {
              title: "Step 3 of 4: Run framework analysis",
              description:
                "Analyze your brief across selected frameworks, then synthesize consensus/conflicts into a recommendation.",
              action: busy === "analyze" ? "Starting Analysis..." : "Run Analysis",
            }
          : {
              title: "Step 4 of 4: Decide and execute",
              description:
                "Review recommendation evidence and execution actions. Expand framework panels only when needed.",
              action: showFrameworkPanels ? "Hide Framework Panels" : "Show Framework Panels",
            };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 lg:px-10">
      {busy === "brief" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-5 text-slate-100 shadow-2xl">
            <h2 className="text-lg font-semibold">Building Decision Brief…</h2>
            <p className="mt-2 text-sm text-slate-300">
              This can take up to a minute or more depending on model/provider latency.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              Elapsed: {briefElapsedSeconds}s
            </p>
          </div>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_20px_80px_-42px_rgba(2,132,199,0.65)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative z-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-sky-300">DecisionRoom V1</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">
              Make a decision, not just a framework map
            </h1>
            <p className="max-w-3xl text-sm text-slate-300">
              Guided four-step workflow with strict LLM-backed analysis, run recovery, and explicit quality
              gates.
            </p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-slate-500/50 bg-slate-800/60 px-2.5 py-1 text-slate-200">
                1. Define
              </span>
              <span className="rounded-full border border-slate-500/50 bg-slate-800/60 px-2.5 py-1 text-slate-200">
                2. Clarify
              </span>
              <span className="rounded-full border border-slate-500/50 bg-slate-800/60 px-2.5 py-1 text-slate-200">
                3. Analyze
              </span>
              <span className="rounded-full border border-slate-500/50 bg-slate-800/60 px-2.5 py-1 text-slate-200">
                4. Decide
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4">
            <h2 className="text-sm font-semibold text-slate-100">{nextStepMeta.title}</h2>
            <p className="mt-2 text-xs text-slate-300">{nextStepMeta.description}</p>
            <button
              type="button"
              onClick={onExecuteNextStep}
              disabled={Boolean(busy)}
              className="mt-4 w-full rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-60"
            >
              {nextStepMeta.action}
            </button>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Current stage: {stage}</span>
              {decisionId ? <span className="truncate">ID: {decisionId}</span> : null}
            </div>
          </div>
        </div>

        {error ? (
          <p className="relative z-10 mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <IntakeStep
          form={form}
          setForm={setForm}
          showAdvancedIntake={showAdvancedIntake}
          setShowAdvancedIntake={setShowAdvancedIntake}
          onLoadSample={() => setForm(sampleForm)}
        />

        <ClarificationStep
          decisionId={decisionId}
          form={form}
          questions={questions}
          answers={answers}
          answeredQuestionCount={answeredQuestionCount}
          busy={busy}
          onGenerateQuestions={onGenerateQuestions}
          onAutofillAnswers={onAutofillAnswers}
          onSubmitAnswers={onSubmitAnswers}
          onUpdateAnswer={(questionId, answer) =>
            setAnswers((prev) => ({
              ...prev,
              [questionId]: answer,
            }))
          }
          contextAlternatives={contextAlternatives}
          contextConstraints={contextConstraints}
          contextStakeholders={contextStakeholders}
          contextSuccessCriteria={contextSuccessCriteria}
        />
      </section>

      <AnimatePresence>
        {brief ? (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.28 }}
            className="grid gap-6 xl:grid-cols-[1fr_1fr]"
          >
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/65 p-5">
              <h2 className="text-lg font-semibold text-slate-100">3. Decision Brief</h2>
              <p className="mt-2 text-sm text-slate-300">{brief.decisionStatement}</p>

              <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">
                <p>
                  Quality score: {typeof briefQualityScore === "number" ? `${Math.round(briefQualityScore * 100)}%` : "n/a"}
                </p>
                <p>Minimum for analysis: {Math.round(MIN_BRIEF_QUALITY * 100)}%</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Alternatives</p>
                  <ul className="space-y-1 text-xs text-slate-200">
                    {brief.alternatives.map((option) => (
                      <li key={option}>• {option}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Success Criteria</p>
                  <ul className="space-y-1 text-xs text-slate-200">
                    {brief.successCriteria.map((criterion) => (
                      <li key={criterion}>• {criterion}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Constraints</p>
                  <ul className="space-y-1 text-xs text-slate-200">
                    {brief.constraints.map((constraint) => (
                      <li key={constraint}>• {constraint}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-xs text-slate-200">
                  <p>
                    <span className="font-semibold text-slate-100">Deadline:</span> {brief.deadline ?? "Not set"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-100">Risk tolerance:</span> {brief.riskTolerance}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-100">Budget:</span> {brief.budget ?? "Not set"}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-100">Time limit:</span> {brief.timeLimit ?? "Not set"}
                  </p>
                </div>
              </div>
            </div>

            <AnalysisStep
              brief={brief}
              briefQualityScore={briefQualityScore}
              providerPreference={providerPreference}
              setProviderPreference={setProviderPreference}
              rankedFrameworkFits={rankedFrameworkFits}
              selectedFrameworkIds={selectedFrameworkIds}
              setSelectedFrameworkIds={setSelectedFrameworkIds}
              selectedFrameworkArray={selectedFrameworkArray}
              showFrameworkSelector={showFrameworkSelector}
              setShowFrameworkSelector={setShowFrameworkSelector}
              busy={busy}
              decisionId={decisionId}
              runStatus={runStatus}
              onStartAnalysis={onStartAnalysis}
            />
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {results ? (
          <RecommendationStep
            results={results}
            recommendation={recommendation}
            decisionId={decisionId}
            showRelationshipMap={showRelationshipMap}
            setShowRelationshipMap={setShowRelationshipMap}
            activeFrameworkId={activeFrameworkId}
            setActiveFrameworkId={setActiveFrameworkId}
            showFrameworkPanels={showFrameworkPanels}
            setShowFrameworkPanels={setShowFrameworkPanels}
            displayedFrameworkResults={displayedFrameworkResults}
            frameworkOptions={frameworkOptions}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
