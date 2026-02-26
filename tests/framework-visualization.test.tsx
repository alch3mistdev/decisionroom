/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FrameworkVisualization } from "@/components/FrameworkVisualization";
import { inferDecisionThemeVector } from "@/lib/analysis/theme";
import { getFrameworkDefinition } from "@/lib/frameworks/registry";
import { buildCanonicalTop12Visualization } from "@/lib/frameworks/visual-builders";
import type { DecisionBrief, FrameworkResult, Top12DeepFrameworkId } from "@/lib/types";
import { TOP_12_DEEP_FRAMEWORK_IDS } from "@/lib/types";

function makeResult(
  overrides: Partial<FrameworkResult> & {
    vizPayload: FrameworkResult["vizPayload"];
  },
): FrameworkResult {
  return {
    frameworkId: "eisenhower_matrix",
    frameworkName: "Eisenhower Matrix",
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
    deepSupported: true,
    ...overrides,
  };
}

describe("FrameworkVisualization", () => {
  it("renders quadrant visualizations when data is wrapped under quadrants key", () => {
    render(
      <FrameworkVisualization
        result={makeResult({
          vizPayload: {
            type: "quadrant",
            title: "Eisenhower Prioritization",
            data: {
              quadrants: [
                {
                  id: "do",
                  label: "Do First",
                  count: 2,
                  items: ["Finalize rollout plan", "Confirm incident runbook"],
                },
              ],
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Do First")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("does not crash when non-array payload is returned for list visualizations", () => {
    expect(() =>
      render(
        <FrameworkVisualization
          result={makeResult({
            vizPayload: {
              type: "list",
              title: "List",
              data: { unexpected: true },
            },
          })}
        />,
      ),
    ).not.toThrow();
  });

  it("renders canonical top-12 visual components", () => {
    const brief: DecisionBrief = {
      title: "AI assistant launch",
      decisionStatement: "Choose the launch path for an enterprise support assistant.",
      context:
        "Delivery capacity is constrained and leadership requires measurable gains with minimal risk.",
      alternatives: ["Immediate launch", "Phased pilot", "Delay quarter"],
      constraints: ["SOC2 controls", "No support headcount increase", "CSAT must not regress"],
      deadline: "End of quarter",
      stakeholders: ["Support", "Security", "Product", "Customer Success"],
      successCriteria: ["20% handle-time reduction", "10% FCR lift"],
      riskTolerance: "medium",
      budget: "$180k",
      timeLimit: "12 weeks",
      assumptions: ["Data quality holds", "Pilot users provide representative signal"],
      openQuestions: ["Guardrails depth", "Segment sequence"],
      executionSteps: ["Define scope", "Implement safeguards", "Run pilot", "Scale"],
    };

    const expectedMarker: Record<Top12DeepFrameworkId, string> = {
      eisenhower_matrix: "Urgency",
      swot_analysis: "Strengths",
      bcg_matrix: "Relative Market Share",
      project_portfolio_matrix: "Strategic Value",
      pareto_principle: "80%",
      hype_cycle: "Peak of Inflated Expectations",
      chasm_diffusion_model: "Chasm",
      monte_carlo_simulation: "P50",
      consequences_model: "Direct",
      crossroads_model: "Feasibility",
      conflict_resolution_model: "Recommended mode:",
      double_loop_learning: "Single-loop fixes optimize behavior",
    };

    const themes = inferDecisionThemeVector(brief);

    for (const frameworkId of TOP_12_DEEP_FRAMEWORK_IDS) {
      const framework = getFrameworkDefinition(frameworkId);
      const vizPayload = buildCanonicalTop12Visualization(frameworkId, brief, themes);
      render(
        <FrameworkVisualization
          result={makeResult({
            frameworkId,
            frameworkName: framework.name,
            vizPayload,
          })}
        />,
      );

      expect(screen.getByText(vizPayload.title)).toBeInTheDocument();
      expect(screen.getAllByText(expectedMarker[frameworkId], { exact: false }).length).toBeGreaterThan(0);
      cleanup();
    }
  });
});
