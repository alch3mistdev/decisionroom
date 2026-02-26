function normalizePotentialJson(input: string): string {
  return input
    .replaceAll(/[“”]/g, "\"")
    .replaceAll(/[‘’]/g, "'")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function sanitizeJsonLike(input: string): string {
  return input
    .replaceAll(/,\s*([}\]])/g, "$1")
    .replaceAll(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
    .replaceAll(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"');
}

function extractFirstJsonCandidate(input: string): string {
  const startObject = input.indexOf("{");
  const startArray = input.indexOf("[");
  const start =
    startObject === -1
      ? startArray
      : startArray === -1
        ? startObject
        : Math.min(startObject, startArray);

  if (start === -1) {
    throw new Error("No JSON found in model response");
  }

  const opener = input[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  throw new Error("Incomplete JSON structure in model response");
}

export function parseJsonFromText(input: string): unknown {
  const trimmed = normalizePotentialJson(input);
  if (!trimmed) {
    throw new Error("Empty model response");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const candidate = extractFirstJsonCandidate(trimmed);
    try {
      return JSON.parse(candidate);
    } catch {
      const sanitized = sanitizeJsonLike(candidate);
      return JSON.parse(sanitized);
    }
  }
}
