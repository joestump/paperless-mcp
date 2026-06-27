import { z } from "zod";

// Paperless-NGX represents a tag/correspondent/document-type's matching
// algorithm as an integer on the model (`MatchingModel.MATCHING_ALGORITHMS`
// in src/documents/models.py). The serializers auto-generate the field from a
// PositiveIntegerField ChoiceField, so the API expects the *integer* code and
// rejects string values like "fuzzy".
//
// Verified against paperless-ngx source (src/documents/models.py):
//   MATCH_NONE  = 0  ("None"               — disables auto-matching)
//   MATCH_ANY   = 1  ("Any word"           — DEFAULT)
//   MATCH_ALL   = 2  ("All words")
//   MATCH_LITERAL = 3 ("Exact match")
//   MATCH_REGEX = 4  ("Regular expression")
//   MATCH_FUZZY = 5  ("Fuzzy word")
//   MATCH_AUTO  = 6  ("Automatic")
//
// We expose a friendly string enum to callers and translate it to the integer
// code before sending. This keeps all three domains (tags, correspondents,
// document types) consistent — previously tags sent a 0–4 integer with an
// off-by-one mapping, while correspondents/document types sent raw strings the
// API could not accept.
export const MATCHING_ALGORITHMS = {
  none: 0,
  any: 1,
  all: 2,
  exact: 3,
  "regular expression": 4,
  fuzzy: 5,
  auto: 6,
} as const;

export type MatchingAlgorithmName = keyof typeof MATCHING_ALGORITHMS;

export const matchingAlgorithmSchema = z
  .enum(["none", "any", "all", "exact", "regular expression", "fuzzy", "auto"])
  .describe(
    "How to match text patterns to auto-assign this object to documents: " +
      "'none'=disable auto-matching, 'any'=any word matches, 'all'=all words must match, " +
      "'exact'=exact phrase match, 'regular expression'=use regex patterns, " +
      "'fuzzy'=approximate matching tolerating typos, 'auto'=Paperless learns from your " +
      "manual assignments. Default is 'any'."
  );

// Translate a friendly matching-algorithm name to the integer code the API
// expects. Returns undefined when no value was supplied so the field is omitted
// (the API then applies its own default of MATCH_ANY=1).
export function resolveMatchingAlgorithm(
  name: MatchingAlgorithmName | undefined
): number | undefined {
  if (name === undefined) return undefined;
  return MATCHING_ALGORITHMS[name];
}
