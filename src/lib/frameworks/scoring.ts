import type { DecisionBrief, ThemeVector } from "@/lib/types";
import { clamp, round } from "@/lib/utils/math";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "their",
  "have",
  "will",
  "should",
  "could",
  "would",
  "about",
  "after",
  "before",
  "while",
  "under",
  "over",
  "across",
  "across",
  "than",
  "then",
  "also",
  "each",
  "per",
  "via",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

export function tokenOverlap(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);

  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of a) {
    if (b.has(token)) {
      matches += 1;
    }
  }

  return clamp(matches / Math.max(Math.min(a.size, b.size), 1));
}

export function keywordScore(value: string, keywords: string[]): number {
  const source = value.toLowerCase();
  const hitCount = keywords.reduce(
    (acc, keyword) => (source.includes(keyword.toLowerCase()) ? acc + 1 : acc),
    0,
  );

  return clamp(hitCount / Math.max(keywords.length, 1));
}

export function rankWeight(index: number, total: number): number {
  if (total <= 1) {
    return 1;
  }

  return clamp(1 - index / Math.max(total - 1, 1));
}

export function deadlinePressure(brief: DecisionBrief): number {
  if (!brief.deadline) {
    return 0.45;
  }

  const daysSignal = keywordScore(brief.deadline, [
    "today",
    "tomorrow",
    "week",
    "month",
    "quarter",
    "q1",
    "q2",
    "q3",
    "q4",
    "year",
  ]);

  return clamp(0.55 + daysSignal * 0.35);
}

export function stakeholderLoad(brief: DecisionBrief): number {
  return clamp(brief.stakeholders.length / 10);
}

export function constraintPenalty(brief: DecisionBrief): number {
  return clamp(brief.constraints.length / 12);
}

export function resourcePressure(brief: DecisionBrief, themes: ThemeVector): number {
  const budgetSignal = brief.budget ? 0.22 : 0.08;
  const timeSignal = brief.timeLimit ? 0.2 : 0.1;
  return clamp(0.42 * themes.resources + budgetSignal + timeSignal);
}

export function aggressivenessHint(option: string): number {
  const normalized = option.toLowerCase();

  if (
    normalized.includes("full") ||
    normalized.includes("all") ||
    normalized.includes("aggressive") ||
    normalized.includes("commit")
  ) {
    return 0.9;
  }

  if (
    normalized.includes("pilot") ||
    normalized.includes("phase") ||
    normalized.includes("trial") ||
    normalized.includes("incremental")
  ) {
    return 0.5;
  }

  if (normalized.includes("delay") || normalized.includes("conservative") || normalized.includes("safe")) {
    return 0.25;
  }

  return 0.62;
}

export function normalizeContributions(raw: Array<{ label: string; value: number; detail?: string }>): Array<{
  label: string;
  contribution: number;
  cumulative: number;
  detail?: string;
}> {
  const safe = raw.map((item) => ({
    ...item,
    value: Math.max(item.value, 0.0001),
  }));

  const total = safe.reduce((sum, item) => sum + item.value, 0);
  const sorted = safe
    .map((item) => ({
      label: item.label,
      contribution: round(item.value / Math.max(total, 1e-9), 3),
      detail: item.detail,
    }))
    .sort((a, b) => b.contribution - a.contribution);

  let cumulative = 0;
  return sorted.map((item) => {
    cumulative = clamp(cumulative + item.contribution);
    return {
      label: item.label,
      contribution: item.contribution,
      cumulative: round(cumulative, 3),
      detail: item.detail,
    };
  });
}

export function bounded(value: number): number {
  return round(clamp(value), 3);
}

