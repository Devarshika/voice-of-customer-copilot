import type { Analysis, PainPoint, Review } from "./types";

/**
 * Deterministic evaluation of the insight engine against the connected dataset.
 * Nothing here estimates or invents a score: every number is a count or a ratio
 * of counts over the sampled insights and their linked reviews. Anything that
 * cannot be computed from the connected data is reported as "Not evaluated".
 */

export type CheckResult =
  | { evaluated: false }
  | {
      evaluated: true;
      /** Sampled units that passed. */
      passed: number;
      /** Sampled units checked. */
      checked: number;
      /** passed / checked. */
      ratio: number;
      status: "Pass" | "Warn" | "Fail";
      detail: string;
    };

export type Flag = {
  insightId: string;
  insightLabel: string;
  reviewIds: string[];
  reason: string;
};

export type Evaluation = {
  /** Number of insights sampled and number of linked reviews inspected. */
  sample: { insights: number; insightsAvailable: number; reviewsChecked: number };
  grounding: CheckResult;
  consistency: CheckResult;
  relevance: CheckResult;
  unsupportedClaims: { evaluated: boolean; count: number; checked: number };
  coverage: { evaluatedInsights: number; totalInsights: number; ratio: number | null };
  flags: Flag[];
  overall: "Pass" | "Warn" | "Fail" | "Not evaluated";
};

/** How many linked reviews per insight are inspected for consistency. */
const REVIEWS_PER_INSIGHT = 150;

const notEvaluated: CheckResult = { evaluated: false };

function result(passed: number, checked: number, detail: string): CheckResult {
  if (checked === 0) return notEvaluated;
  const ratio = passed / checked;
  return {
    evaluated: true,
    passed,
    checked,
    ratio,
    status: ratio >= 0.95 ? "Pass" : ratio >= 0.8 ? "Warn" : "Fail",
    detail,
  };
}

const clean = (s: string) => s.replace(/^…|…$/g, "").trim().toLowerCase();

const searchable = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Discovered phrases are token-normalized, so punctuation must not create a false flag. */
function containsThemeWording(text: string, keywords: string[]): boolean {
  const normalized = searchable(text);
  return keywords.some((keyword) => normalized.includes(searchable(keyword)));
}

export function evaluate(reviews: Review[], analysis: Analysis): Evaluation {
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const sampled: PainPoint[] = analysis.painPoints;

  let groundedPass = 0;
  let groundedChecked = 0;
  let consistentPass = 0;
  let consistentChecked = 0;
  let relevantPass = 0;
  let relevantChecked = 0;
  let unsupported = 0;
  let claimsChecked = 0;
  let evaluatedInsights = 0;
  const flags: Flag[] = [];

  for (const pain of sampled) {
    let insightEvaluated = false;

    // 1. Evidence grounding: every linked id must resolve to a real review with text.
    const missing: string[] = [];
    for (const id of pain.reviewIds) {
      groundedChecked += 1;
      const r = byId.get(id);
      if (r && r.text.trim().length > 0) groundedPass += 1;
      else if (missing.length < 3) missing.push(id);
    }
    if (pain.reviewIds.length > 0) insightEvaluated = true;
    if (missing.length > 0) {
      flags.push({
        insightId: pain.id,
        insightLabel: pain.label,
        reviewIds: missing,
        reason: "Linked review IDs do not resolve to review text in the connected dataset.",
      });
    }

    // 2. Theme consistency: linked reviews must contain the wording that matched.
    const sample = pain.reviewIds.slice(0, REVIEWS_PER_INSIGHT);
    const offTheme: string[] = [];
    for (const id of sample) {
      const r = byId.get(id);
      if (!r) continue;
      consistentChecked += 1;
      if (containsThemeWording(r.text, pain.keywords)) consistentPass += 1;
      else if (offTheme.length < 3) offTheme.push(id);
    }
    if (offTheme.length > 0) {
      flags.push({
        insightId: pain.id,
        insightLabel: pain.label,
        reviewIds: offTheme,
        reason: `Linked review text contains none of the wording behind "${pain.label}".`,
      });
    }

    // 3. Evidence relevance: excerpts must be verbatim, linked, and on-theme.
    for (const ex of pain.excerpts) {
      relevantChecked += 1;
      const r = byId.get(ex.reviewId);
      const snippet = clean(ex.text);
      const linked = pain.reviewIds.includes(ex.reviewId);
      const verbatim = !!r && r.text.toLowerCase().includes(snippet);
      const onTheme = containsThemeWording(snippet, pain.keywords);
      if (linked && verbatim && onTheme) relevantPass += 1;
      else {
        flags.push({
          insightId: pain.id,
          insightLabel: pain.label,
          reviewIds: [ex.reviewId],
          reason: !r
            ? "Excerpt cites a review ID that is not in the connected dataset."
            : !verbatim
              ? "Excerpt text is not a verbatim span of the cited review."
              : !linked
                ? "Excerpt review is not in this insight's supporting review list."
                : "Excerpt does not contain the wording the insight is about.",
        });
      }
    }

    // 4. Unsupported-claim detection: each stated number must match the evidence.
    claimsChecked += 1;
    if (pain.mentionCount !== pain.reviewIds.length) {
      unsupported += 1;
      flags.push({
        insightId: pain.id,
        insightLabel: pain.label,
        reviewIds: pain.reviewIds.slice(0, 3),
        reason: `Stated mention count (${pain.mentionCount}) does not match the number of supporting review IDs (${pain.reviewIds.length}).`,
      });
    }

    claimsChecked += 1;
    if (pain.trend.evidence) {
      const dated = pain.reviewIds.filter((id) => byId.get(id)?.date).length;
      if (pain.trend.recent + pain.trend.earlier > dated) {
        unsupported += 1;
        flags.push({
          insightId: pain.id,
          insightLabel: pain.label,
          reviewIds: pain.reviewIds.slice(0, 3),
          reason: "Trend counts exceed the number of linked reviews that carry a date.",
        });
      }
    }

    claimsChecked += 1;
    if (pain.churn.evidence) {
      const inside = pain.churn.reviewIds.filter(
        (id) => byId.has(id) && pain.reviewIds.includes(id),
      ).length;
      if (inside !== pain.churn.reviewIds.length) {
        unsupported += 1;
        flags.push({
          insightId: pain.id,
          insightLabel: pain.label,
          reviewIds: pain.churn.reviewIds.slice(0, 3),
          reason: "Churn-signal reviews are not all part of this insight's supporting reviews.",
        });
      }
    }

    claimsChecked += 1;
    if (pain.opportunity.evidence) {
      const bad = pain.opportunity.reviewIds.filter((id) => !byId.has(id));
      if (bad.length > 0) {
        unsupported += 1;
        flags.push({
          insightId: pain.id,
          insightLabel: pain.label,
          reviewIds: bad.slice(0, 3),
          reason: "Opportunity cites review IDs that are not in the connected dataset.",
        });
      }
    }

    claimsChecked += 1;
    const ratedLinked = pain.reviewIds.filter((id) => byId.get(id)?.rating !== null && byId.get(id)?.rating !== undefined).length;
    if (pain.avgRating !== null && ratedLinked === 0) {
      unsupported += 1;
      flags.push({
        insightId: pain.id,
        insightLabel: pain.label,
        reviewIds: pain.reviewIds.slice(0, 3),
        reason: "Average rating is stated although no linked review carries a rating.",
      });
    }

    if (insightEvaluated) evaluatedInsights += 1;
  }

  const grounding = result(groundedPass, groundedChecked, "Linked review IDs resolving to real review text");
  const consistency = result(consistentPass, consistentChecked, "Linked reviews containing the theme wording");
  const relevance = result(relevantPass, relevantChecked, "Excerpts that are verbatim, linked and on-theme");

  const checks = [grounding, consistency, relevance].filter(
    (c): c is Extract<CheckResult, { evaluated: true }> => c.evaluated,
  );

  const overall: Evaluation["overall"] =
    reviews.length === 0 || sampled.length === 0 || checks.length === 0
      ? "Not evaluated"
      : checks.some((c) => c.status === "Fail") || unsupported > 0
        ? "Fail"
        : checks.some((c) => c.status === "Warn")
          ? "Warn"
          : "Pass";

  return {
    sample: {
      insights: sampled.length,
      insightsAvailable: analysis.painPoints.length,
      reviewsChecked: consistentChecked,
    },
    grounding,
    consistency,
    relevance,
    unsupportedClaims: { evaluated: claimsChecked > 0, count: unsupported, checked: claimsChecked },
    coverage: {
      evaluatedInsights,
      totalInsights: sampled.length,
      ratio: sampled.length ? evaluatedInsights / sampled.length : null,
    },
    flags: flags.slice(0, 20),
    overall,
  };
}
