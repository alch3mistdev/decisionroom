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

function repairIncompleteJsonCandidate(input: string): string {
  const source = input.trim();
  const startObject = source.indexOf("{");
  const startArray = source.indexOf("[");
  const start =
    startObject === -1
      ? startArray
      : startArray === -1
        ? startObject
        : Math.min(startObject, startArray);

  if (start === -1) {
    return source;
  }

  const candidate = source.slice(start);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let repaired = "";

  for (const char of candidate) {
    if (escaped) {
      escaped = false;
      repaired += char;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      repaired += char;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      repaired += char;
      continue;
    }

    if (inString) {
      repaired += char;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      repaired += char;
      continue;
    }

    if (char === "[") {
      stack.push("]");
      repaired += char;
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.at(-1);
      if (expected === char) {
        stack.pop();
        repaired += char;
      }
      continue;
    }

    repaired += char;
  }

  if (inString) {
    repaired += "\"";
  }

  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
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

  const parseAttempts: string[] = [];
  parseAttempts.push(trimmed);

  try {
    parseAttempts.push(extractFirstJsonCandidate(trimmed));
  } catch {
    parseAttempts.push(repairIncompleteJsonCandidate(trimmed));
  }

  for (const attempt of parseAttempts) {
    if (!attempt) {
      continue;
    }

    try {
      return JSON.parse(attempt);
    } catch {
      // Continue to sanitization/repair passes.
    }

    try {
      return JSON.parse(sanitizeJsonLike(attempt));
    } catch {
      // Continue to repaired parse pass.
    }

    const repaired = repairIncompleteJsonCandidate(attempt);
    try {
      return JSON.parse(repaired);
    } catch {
      // Continue to sanitized repaired parse.
    }

    const repairedSanitized = sanitizeJsonLike(repaired);
    try {
      return JSON.parse(repairedSanitized);
    } catch {
      // Continue with next attempt source.
    }
  }

  throw new Error("Failed to parse JSON from model response");
}
