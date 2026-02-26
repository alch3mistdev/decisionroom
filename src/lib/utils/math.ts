import type { ThemeVector } from "@/lib/types";

export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function cosineSimilarity(a: ThemeVector, b: ThemeVector): number {
  const aVals = Object.values(a);
  const bVals = Object.values(b);

  const dot = aVals.reduce((acc, current, index) => acc + current * bVals[index], 0);
  const magnitudeA = Math.sqrt(aVals.reduce((acc, current) => acc + current * current, 0));
  const magnitudeB = Math.sqrt(bVals.reduce((acc, current) => acc + current * current, 0));

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (magnitudeA * magnitudeB);
}
