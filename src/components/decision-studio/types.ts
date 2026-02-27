import type React from "react";

import type {
  CreateDecisionInput,
  DecisionBrief,
  DecisionRecommendation,
  DecisionRunStatus,
  FrameworkId,
  FrameworkResult,
  PropagatedDecisionMap,
  ProviderPreference,
  RankedFrameworkFit,
  SynthesisSummary,
} from "@/lib/types";

export interface ResultsPayload {
  brief: DecisionBrief;
  frameworkResults: FrameworkResult[];
  propagatedMap: PropagatedDecisionMap;
  synthesis: SynthesisSummary;
  runId: string;
  provider: string;
  model: string | null;
}

export interface DecisionDetailPayload {
  decision: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    input: CreateDecisionInput;
  };
  brief: DecisionBrief | null;
  briefQualityScore: number | null;
  clarifications: {
    generationId: string;
    questions: Array<{
      id: string;
      question: string;
      rationale: string;
      answer: string | null;
      status: string;
      sequence: number;
    }>;
  } | null;
  latestRun: DecisionRunStatus | null;
}

export interface AnalysisStepProps {
  brief: DecisionBrief;
  briefQualityScore: number | null;
  providerPreference: ProviderPreference;
  setProviderPreference: (value: ProviderPreference) => void;
  rankedFrameworkFits: RankedFrameworkFit[];
  selectedFrameworkIds: Set<FrameworkId>;
  setSelectedFrameworkIds: React.Dispatch<React.SetStateAction<Set<FrameworkId>>>;
  selectedFrameworkArray: FrameworkId[];
  showFrameworkSelector: boolean;
  setShowFrameworkSelector: React.Dispatch<React.SetStateAction<boolean>>;
  busy: string | null;
  decisionId: string | null;
  runStatus: DecisionRunStatus | null;
  onStartAnalysis: () => Promise<void>;
}

export interface RecommendationViewProps {
  results: ResultsPayload;
  recommendation: DecisionRecommendation | null;
  decisionId: string | null;
  showRelationshipMap: boolean;
  setShowRelationshipMap: React.Dispatch<React.SetStateAction<boolean>>;
  activeFrameworkId: FrameworkId | null;
  setActiveFrameworkId: React.Dispatch<React.SetStateAction<FrameworkId | null>>;
  showFrameworkPanels: boolean;
  setShowFrameworkPanels: React.Dispatch<React.SetStateAction<boolean>>;
  displayedFrameworkResults: FrameworkResult[];
  frameworkOptions: Array<{ id: FrameworkId; name: string }>;
}
