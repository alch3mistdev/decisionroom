/** @vitest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DecisionStudio } from "@/components/DecisionStudio";
import { rankFrameworkFitsForBrief } from "@/lib/frameworks/fit-ranking";
import { listFrameworkDefinitions } from "@/lib/frameworks/registry";
import type { DecisionBrief } from "@/lib/types";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

const briefA: DecisionBrief = {
  title: "Initial brief",
  decisionStatement:
    "Should we launch the AI support assistant immediately or phase release to reduce risk?",
  context:
    "Decision balances near-term urgency with compliance and reliability guardrails under tight deadlines.",
  alternatives: ["Launch now", "Phased rollout", "Delay launch"],
  constraints: ["No compliance risk", "No support headcount increase"],
  deadline: "End of quarter",
  stakeholders: ["Support", "Security", "Product"],
  successCriteria: ["Improve first-contact resolution", "Reduce average handle time"],
  riskTolerance: "medium",
  budget: "$180k",
  timeLimit: "12 weeks",
  assumptions: ["Pilot telemetry is representative", "Operations can absorb rollout tasks"],
  openQuestions: ["What escalation guardrails are required?"],
  executionSteps: ["Finalize scope", "Pilot with design partners", "Gate full rollout"],
};

const briefB: DecisionBrief = {
  title: "Updated brief",
  decisionStatement:
    "Should we prioritize crossing the early-majority gap before broad rollout in enterprise segments?",
  context:
    "Primary uncertainty is market adoption sequencing and stakeholder alignment for proof-point delivery.",
  alternatives: ["Bridge early majority first", "Continue design-partner pilot", "Broaden rollout"],
  constraints: ["Maintain enterprise trust", "Keep onboarding complexity low"],
  deadline: "Next two quarters",
  stakeholders: ["Sales", "Customer Success", "Product Marketing", "Product"],
  successCriteria: ["Increase adoption conversion", "Reduce pilot-to-scale cycle time"],
  riskTolerance: "high",
  budget: "$350k",
  timeLimit: "24 weeks",
  assumptions: ["Reference stories unlock adjacent accounts", "Onboarding friction can be reduced quickly"],
  openQuestions: ["Which segment signals readiness first?", "How do we de-risk migration concerns?"],
  executionSteps: ["Map segment proof points", "Run early-majority bridge experiments", "Scale by segment"],
};

describe("DecisionStudio flow", () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enforces minimum answered clarifications before brief build", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);

        if (url.endsWith("/api/decisions") && init?.method === "POST") {
          return jsonResponse({ decisionId: "decision-1" });
        }

        if (url.endsWith("/api/decisions/decision-1/refine")) {
          return jsonResponse({
            questions: [
              { id: "q_1", question: "Question 1", rationale: "R1" },
              { id: "q_2", question: "Question 2", rationale: "R2" },
              { id: "q_3", question: "Question 3", rationale: "R3" },
            ],
          });
        }

        return jsonResponse({ error: `Unexpected URL ${url}` }, 500);
      });

    render(<DecisionStudio />);

    const prompt = screen.getByPlaceholderText("What decision are you trying to make, and why now?");
    await userEvent.type(prompt, "Should we ship the pilot this quarter?");

    await userEvent.click(screen.getByRole("button", { name: "Create Decision + Start Clarification" }));

    await waitFor(() => {
      expect(screen.getByText("Question 1")).toBeInTheDocument();
    });

    const answerInputs = screen.getAllByPlaceholderText("Answer");
    await userEvent.type(answerInputs[0], "Answer one");
    await userEvent.type(answerInputs[1], "Answer two");

    await userEvent.click(screen.getByRole("button", { name: "Build Brief" }));

    expect(
      screen.getByText("Answer at least 3 clarification questions before building the brief."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resumes polling for an in-progress run on reload", async () => {
    let runPolled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/api/decisions/decision-2")) {
        return jsonResponse({
          decision: {
            id: "decision-2",
            title: "Decision",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-02T00:00:00.000Z",
            input: {
              prompt: "Should we launch now?",
            },
          },
          brief: {
            title: "Decision",
            decisionStatement: "Should we launch now with a guided pilot rollout?",
            context: "Context describing constraints and readiness in detail.",
            alternatives: ["Pilot", "Delay"],
            constraints: ["No downtime"],
            deadline: null,
            stakeholders: ["Ops"],
            successCriteria: ["KPI"],
            riskTolerance: "medium",
            budget: null,
            timeLimit: null,
            assumptions: ["Assumption 1", "Assumption 2"],
            openQuestions: ["Question"],
            executionSteps: ["Step 1", "Step 2", "Step 3"],
          },
          briefQualityScore: 0.8,
          clarifications: null,
          latestRun: {
            runId: "run-1",
            decisionId: "decision-2",
            provider: "hosted",
            model: "claude-test",
            status: "analyzing",
            error: null,
            startedAt: "2026-02-02T00:00:00.000Z",
            endedAt: null,
            frameworkCount: 2,
            completedFrameworkCount: 1,
          },
        });
      }

      if (url.endsWith("/api/runs/run-1")) {
        runPolled = true;
        return jsonResponse({
          runId: "run-1",
          decisionId: "decision-2",
          provider: "hosted",
          model: "claude-test",
          status: "complete",
          error: null,
          startedAt: "2026-02-02T00:00:00.000Z",
          endedAt: "2026-02-02T00:01:00.000Z",
          frameworkCount: 2,
          completedFrameworkCount: 2,
        });
      }

      if (url.endsWith("/api/decisions/decision-2/results")) {
        return jsonResponse({
          brief: {
            title: "Decision",
            decisionStatement: "Should we launch now with a guided pilot rollout?",
            context: "Context describing constraints and readiness in detail.",
            alternatives: ["Pilot", "Delay"],
            constraints: ["No downtime"],
            deadline: null,
            stakeholders: ["Ops"],
            successCriteria: ["KPI"],
            riskTolerance: "medium",
            budget: null,
            timeLimit: null,
            assumptions: ["Assumption 1", "Assumption 2"],
            openQuestions: ["Question"],
            executionSteps: ["Step 1", "Step 2", "Step 3"],
          },
          frameworkResults: [
            {
              frameworkId: "swot_analysis",
              frameworkName: "SWOT Analysis",
              applicabilityScore: 0.8,
              confidence: 0.75,
              insights: ["Insight 1"],
              actions: ["Action 1"],
              risks: ["Risk 1"],
              assumptions: ["Assumption 1"],
              themes: {
                risk: 0.5,
                urgency: 0.5,
                opportunity: 0.5,
                uncertainty: 0.5,
                resources: 0.5,
                stakeholderImpact: 0.5,
              },
              vizPayload: {
                type: "list",
                title: "List",
                data: [{ label: "Item", value: 1 }],
              },
              deepSupported: true,
            },
          ],
          propagatedMap: {
            nodes: [],
            edges: [],
            clusters: [],
            consensus: [],
            conflicts: [],
          },
          synthesis: {
            topFrameworks: [],
            contradictions: [],
            recommendedActions: ["Action 1"],
            checkpoints: ["Checkpoint 1"],
            decisionRecommendation: {
              recommendedOption: "Pilot",
              confidence: 0.74,
              rationale: "Best current fit.",
              tradeoffs: ["Tradeoff"],
              nextActions: ["Action 1"],
              optionScores: [
                {
                  option: "Pilot",
                  score: 0.8,
                  confidence: 0.75,
                  rationale: "Best fit",
                },
              ],
            },
          },
          runId: "run-1",
          provider: "hosted",
          model: "claude-test",
        });
      }

      return jsonResponse({ error: `Unexpected URL ${url}` }, 500);
    });

    render(<DecisionStudio initialDecisionId="decision-2" />);

    await waitFor(() => {
      expect(runPolled).toBe(true);
      expect(screen.getByText("Decision Recommendation")).toBeInTheDocument();
    }, { timeout: 4500 });
  });

  it("shows brief-building modal and recovers from gateway timeout by polling decision context", async () => {
    let contextPollCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/decisions") && init?.method === "POST") {
        return jsonResponse({ decisionId: "decision-3" });
      }

      if (url.endsWith("/api/decisions/decision-3/refine") && init?.method === "POST") {
        const body = init.body ? JSON.parse(String(init.body)) : {};
        if (body.mode === "generate_questions") {
          return jsonResponse({
            questions: [
              { id: "q_1", question: "Question 1", rationale: "R1" },
              { id: "q_2", question: "Question 2", rationale: "R2" },
              { id: "q_3", question: "Question 3", rationale: "R3" },
            ],
          });
        }
        if (body.mode === "submit_answers") {
          return jsonResponse(
            {
              error: "Gateway Timeout",
              code: "GATEWAY_TIMEOUT",
            },
            504,
          );
        }
      }

      if (url.endsWith("/api/decisions/decision-3")) {
        contextPollCount += 1;
        if (contextPollCount < 2) {
          return jsonResponse({
            decision: {
              id: "decision-3",
              title: "Decision",
              createdAt: "2026-02-01T00:00:00.000Z",
              updatedAt: "2026-02-02T00:00:00.000Z",
              input: {
                prompt: "Should we launch now?",
              },
            },
            brief: null,
            briefQualityScore: null,
            clarifications: null,
            latestRun: null,
          });
        }

        return jsonResponse({
          decision: {
            id: "decision-3",
            title: "Decision",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-02T00:00:00.000Z",
            input: {
              prompt: "Should we launch now?",
            },
          },
          brief: {
            title: "Decision",
            decisionStatement: "Should we launch now with a guided pilot rollout?",
            context: "Context describing constraints and readiness in detail.",
            alternatives: ["Pilot", "Delay"],
            constraints: ["No downtime"],
            deadline: null,
            stakeholders: ["Ops"],
            successCriteria: ["KPI"],
            riskTolerance: "medium",
            budget: null,
            timeLimit: null,
            assumptions: ["Assumption 1", "Assumption 2"],
            openQuestions: ["Question"],
            executionSteps: ["Step 1", "Step 2", "Step 3"],
          },
          briefQualityScore: 0.8,
          clarifications: null,
          latestRun: null,
        });
      }

      return jsonResponse({ error: `Unexpected URL ${url}` }, 500);
    });

    render(<DecisionStudio />);

    const prompt = screen.getByPlaceholderText("What decision are you trying to make, and why now?");
    await userEvent.type(prompt, "Should we ship the pilot this quarter?");
    await userEvent.click(screen.getByRole("button", { name: "Create Decision + Start Clarification" }));

    await waitFor(() => {
      expect(screen.getByText("Question 1")).toBeInTheDocument();
    });

    const answerInputs = screen.getAllByPlaceholderText("Answer");
    await userEvent.type(answerInputs[0], "Answer one");
    await userEvent.type(answerInputs[1], "Answer two");
    await userEvent.type(answerInputs[2], "Answer three");

    await userEvent.click(screen.getByRole("button", { name: "Build Brief" }));

    await waitFor(() => {
      expect(screen.getByText("Building Decision Brief…")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("3. Decision Brief")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("defaults analysis selection to top 4 ranked framework fits and submits those ids", async () => {
    const expectedTop4 = rankFrameworkFitsForBrief(briefA, listFrameworkDefinitions())
      .slice(0, 4)
      .map((framework) => framework.id);
    const analyzeBodies: Array<{ frameworkIds: string[]; providerPreference: string }> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/decisions/decision-4")) {
        return jsonResponse({
          decision: {
            id: "decision-4",
            title: "Decision",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-02T00:00:00.000Z",
            input: {
              prompt: "Should we launch now?",
            },
          },
          brief: briefA,
          briefQualityScore: 0.8,
          clarifications: null,
          latestRun: null,
        });
      }

      if (url.endsWith("/api/decisions/decision-4/analyze") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { frameworkIds: string[]; providerPreference: string };
        analyzeBodies.push(body);
        return jsonResponse({
          runId: "run-4",
          status: "queued",
          provider: "hosted",
          model: "claude-test",
        });
      }

      if (url.endsWith("/api/runs/run-4")) {
        return jsonResponse({
          runId: "run-4",
          decisionId: "decision-4",
          provider: "hosted",
          model: "claude-test",
          status: "queued",
          error: null,
          startedAt: null,
          endedAt: null,
          frameworkCount: 4,
          completedFrameworkCount: 0,
        });
      }

      return jsonResponse({ error: `Unexpected URL ${url}` }, 500);
    });

    render(<DecisionStudio initialDecisionId="decision-4" />);

    await waitFor(() => {
      expect(screen.getByText("4 selected")).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Run Analysis" })[0]);

    await waitFor(() => {
      expect(analyzeBodies).toHaveLength(1);
    });

    expect(analyzeBodies[0].frameworkIds).toEqual(expectedTop4);
    expect(analyzeBodies[0].frameworkIds).toHaveLength(4);
  });

  it("reapplies ranked top-4 defaults when a new brief is built after manual framework changes", async () => {
    const expectedTop4AfterRefresh = rankFrameworkFitsForBrief(briefB, listFrameworkDefinitions())
      .slice(0, 4)
      .map((framework) => framework.id);
    const analyzeBodies: Array<{ frameworkIds: string[]; providerPreference: string }> = [];
    let runIndex = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/decisions/decision-5")) {
        return jsonResponse({
          decision: {
            id: "decision-5",
            title: "Decision",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-02T00:00:00.000Z",
            input: {
              prompt: "Should we launch now?",
            },
          },
          brief: briefA,
          briefQualityScore: 0.8,
          clarifications: {
            generationId: "gen-5",
            questions: [
              {
                id: "q_1",
                question: "Question 1",
                rationale: "R1",
                answer: "Answer one",
                status: "answered",
                sequence: 1,
              },
              {
                id: "q_2",
                question: "Question 2",
                rationale: "R2",
                answer: "Answer two",
                status: "answered",
                sequence: 2,
              },
              {
                id: "q_3",
                question: "Question 3",
                rationale: "R3",
                answer: "Answer three",
                status: "answered",
                sequence: 3,
              },
            ],
          },
          latestRun: null,
        });
      }

      if (url.endsWith("/api/decisions/decision-5/refine") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { mode: string };
        if (body.mode === "submit_answers") {
          return jsonResponse({
            decisionBrief: briefB,
            qualityScore: 0.82,
            provider: "hosted",
            model: "claude-test",
            fallback: false,
            status: "brief_ready",
          });
        }
      }

      if (url.endsWith("/api/decisions/decision-5/analyze") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { frameworkIds: string[]; providerPreference: string };
        analyzeBodies.push(body);
        runIndex += 1;
        return jsonResponse({
          runId: `run-5-${runIndex}`,
          status: "queued",
          provider: "hosted",
          model: "claude-test",
        });
      }

      if (url.includes("/api/runs/run-5-")) {
        return jsonResponse({
          runId: "run-5",
          decisionId: "decision-5",
          provider: "hosted",
          model: "claude-test",
          status: "queued",
          error: null,
          startedAt: null,
          endedAt: null,
          frameworkCount: 4,
          completedFrameworkCount: 0,
        });
      }

      return jsonResponse({ error: `Unexpected URL ${url}` }, 500);
    });

    render(<DecisionStudio initialDecisionId="decision-5" />);

    await waitFor(() => {
      expect(screen.getByText("4 selected")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "All 50" }));

    await waitFor(() => {
      expect(screen.getByText("50 selected")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Build Brief" }));

    await waitFor(() => {
      expect(screen.getByText("4 selected")).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Run Analysis" })[0]);

    await waitFor(() => {
      expect(analyzeBodies).toHaveLength(1);
    });

    expect(analyzeBodies[0].frameworkIds).toEqual(expectedTop4AfterRefresh);
    expect(analyzeBodies[0].frameworkIds).toHaveLength(4);
  });
});
