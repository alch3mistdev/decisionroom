import { describe, expect, it } from "vitest";

import { deepFrameworkCount, listFrameworkDefinitions } from "@/lib/frameworks/registry";
import { FRAMEWORK_IDS } from "@/lib/types";

describe("framework registry", () => {
  it("contains all 50 framework ids with no duplicates", () => {
    const registry = listFrameworkDefinitions();
    const ids = registry.map((framework) => framework.id);

    expect(registry).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(ids.sort()).toEqual([...FRAMEWORK_IDS].sort());
  });

  it("flags exactly 12 deep frameworks", () => {
    expect(deepFrameworkCount()).toBe(12);
  });
});
