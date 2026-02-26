/** @vitest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FrameworkVisualization } from "@/components/FrameworkVisualization";
import type { FrameworkResult } from "@/lib/types";

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
});

