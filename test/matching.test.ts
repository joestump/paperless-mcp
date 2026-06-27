import { describe, it, expect } from "vitest";
import {
  resolveMatchingAlgorithm,
  matchingAlgorithmSchema,
  MATCHING_ALGORITHMS,
} from "../src/utils/matching";

describe("resolveMatchingAlgorithm", () => {
  it("maps each friendly name to the Paperless integer code", () => {
    expect(resolveMatchingAlgorithm("none")).toBe(0);
    expect(resolveMatchingAlgorithm("any")).toBe(1);
    expect(resolveMatchingAlgorithm("all")).toBe(2);
    expect(resolveMatchingAlgorithm("exact")).toBe(3);
    expect(resolveMatchingAlgorithm("regular expression")).toBe(4);
    expect(resolveMatchingAlgorithm("fuzzy")).toBe(5);
    expect(resolveMatchingAlgorithm("auto")).toBe(6);
  });

  it("returns the falsy 0 for 'none' rather than dropping it", () => {
    // Regression guard: 'none' maps to 0, which must survive as a real value.
    expect(resolveMatchingAlgorithm("none")).toBe(0);
    expect(MATCHING_ALGORITHMS.none).toBe(0);
  });

  it("returns undefined when no value is supplied", () => {
    expect(resolveMatchingAlgorithm(undefined)).toBeUndefined();
  });
});

describe("matchingAlgorithmSchema", () => {
  it("accepts every supported friendly name", () => {
    for (const name of Object.keys(MATCHING_ALGORITHMS)) {
      expect(matchingAlgorithmSchema.parse(name)).toBe(name);
    }
  });

  it("rejects unknown values", () => {
    expect(() => matchingAlgorithmSchema.parse("sometimes")).toThrow();
    // Legacy integer input is no longer accepted.
    expect(() => matchingAlgorithmSchema.parse(2 as any)).toThrow();
  });
});
