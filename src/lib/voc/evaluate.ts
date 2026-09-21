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
      method: "exact" | "heuristic";
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
  specificity: CheckResult;
  opportunityGrounding: CheckResult;
  unsupportedClaims: { evaluated: boolean; count: number; checked: number };
  coverage: { evaluatedInsights: number; totalInsights: number; ratio: number | null };
  flags: Flag[];
  overall: "Pass" | "Warn" | "Fail" | "Not evaluated";
};

/** How many linked reviews per insight are inspected for consistency. */
const REVIEWS_PER_INSIGHT = 150;

const notEvaluated: CheckResult = { evaluated: false };

function result(
  passed: number,
  checked: number,
  detail: string,
  method: "exact" | "heuristic" = "exact",
): CheckResult {
  if (checked === 0) return notEvaluated;
  const ratio = passed / checked;
  return {
    evaluated: true,
    passed,
    checked,
    ratio,
    status: ratio >= 0.95 ? "Pass" : ratio >= 0.8 ? "Warn" : "Fail",
    detail,
    method,
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

const PROBLEM_CUES = /\b(?:annoy|awful|bad|block|broke|broken|cancel|confus|crash|delay|difficult|disappoint|error|expens|fail|fault|freez|frustrat|hard|hate|horribl|incorrect|issue|lag|late|lost|miss|poor|problem|refund|reject|ridicul|rude|scam|slow|spam|stuck|terribl|unaccept|unavail|unsafe|useless|waste|wrong|worst|cannot|can't|cant|doesn't|doesnt|don't|dont|never|unable|won't|wont)\w*\b/i;
const VAGUE_WORDS = new Set([
  "app","application","brand","business","company","customer","customers","experience","overall","platform","product","products","service","services","something","system","thing","things","user","users",
]);
const INTERVENTION_WORDS = /\b(?:test|prevent|validation|status|recovery|guidance|warning|confirmation|visibility|correction|resolution|safeguard|communication|options?|controls?|processing|path)\b/i;

function contentWords(text: string): string[] {
  return searchable(text).split(" ").filter((word) => word.length > 2 && !VAGUE_WORDS.has(word));
}

function reviewSupportsProblem(text: string, pain: PainPoint): boolean {
  if (!PROBLEM_CUES.test(text)) return false;
  const evidenceWords = new Set(pain.keywords.flatMap(contentWords));
  const reviewWords = new Set(contentWords(text));
  let shared = 0;
  for (const word of evidenceWords) if (reviewWords.has(word)) shared += 1;
  return shared >= 2 || pain.keywords.some((keyword) => containsThemeWording(text, [keyword]));
}

function isSpecificProblem(pain: PainPoint): boolean {
  const labelWords = contentWords(pain.label);
  const evidenceWords = new Set(pain.keywords.flatMap(contentWords));
  return labelWords.length >= 2 && evidenceWords.size >= 2 && PROBLEM_CUES.test(pain.keywords.join(" "));
}

function normalizedOverlap(a: string, b: string): number {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / union.size;
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
  let specificPass = 0;
  let specificChecked = 0;
  let opportunityPass = 0;
  let opportunityChecked = 0;
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

    // 2. Heuristic semantic consistency: linked reviews must express the same
    // problem proposition, not merely repeat one isolated word.
    const sample = pain.reviewIds.slice(0, REVIEWS_PER_INSIGHT);
    const offTheme: string[] = [];
    for (const id of sample) {
      const r = byId.get(id);
      if (!r) continue;
      consistentChecked += 1;
      if (reviewSupportsProblem(r.text, pain)) consistentPass += 1;
      else if (offTheme.length < 3) offTheme.push(id);
    }
    if (offTheme.length > 0) {
      flags.push({
        insightId: pain.id,
        insightLabel: pain.label,
        reviewIds: offTheme,
        reason: `Sampled linked reviews do not consistently express the underlying problem described by "${pain.label}".`,
      });
    }

    // 3. Evidence relevance: excerpts must be verbatim, linked, and on-theme.
    for (const ex of pain.excerpts) {
      relevantChecked += 1;
      const r = byId.get(ex.reviewId);
      const snippet = clean(ex.text);
      const linked = pain.reviewIds.includes(ex.reviewId);
      const verbatim = !!r && r.text.toLowerCase().includes(snippet);
      const onTheme = reviewSupportsProblem(snippet, pain);
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
                : "Excerpt does not provide clear evidence for the underlying customer problem.",
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

      opportunityChecked += 1;
      const outside = pain.opportunity.reviewIds.filter((id) => !pain.reviewIds.includes(id));
      const excerptOutside = pain.opportunity.excerpts.filter(
        (item) => !pain.opportunity.reviewIds.includes(item.reviewId),
      );
      const problemConnection = pain.keywords.some(
        (keyword) => normalizedOverlap(pain.opportunity.evidence ? pain.opportunity.statement : "", keyword) >= 0.12,
      );
      const notParaphrase = normalizedOverlap(pain.opportunity.statement, pain.label) < 0.72;
      const actionable = INTERVENTION_WORDS.test(pain.opportunity.statement);
      if (outside.length === 0 && excerptOutside.length === 0 && problemConnection && notParaphrase && actionable) {
        opportunityPass += 1;
      } else {
        flags.push({
          insightId: pain.id,
          insightLabel: pain.label,
          reviewIds: pain.opportunity.reviewIds.slice(0, 3),
          reason: "Potential opportunity is generic, repetitive, unsupported, or not clearly connected to the evidenced customer problem.",
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

    specificChecked += 1;
    if (isSpecificProblem(pain)) specificPass += 1;
    else {
      flags.push({
        insightId: pain.id,
        insightLabel: pain.label,
        reviewIds: pain.reviewIds.slice(0, 3),
        reason: "Insight wording is too generic or does not describe a concrete customer problem.",
      });
    }
  }

  const grounding = result(groundedPass, groundedChecked, "Linked review IDs resolving to real review text");
  const consistency = result(
    consistentPass,
    consistentChecked,
    "Linked reviews expressing a compatible problem proposition (deterministic linguistic heuristic)",
    "heuristic",
  );
  const relevance = result(
    relevantPass,
    relevantChecked,
    "Excerpts that are verbatim, linked, and relevant to the underlying problem",
    "heuristic",
  );
  const specificity = result(
    specificPass,
    specificChecked,
    "Insights describing a concrete problem rather than an entity, noun, or vague phrase",
    "heuristic",
  );
  const opportunityGrounding = result(
    opportunityPass,
    opportunityChecked,
    "Opportunity hypotheses linked to the problem evidence, specific, and distinct from the pain-point title",
    "heuristic",
  );

  const checks = [grounding, consistency, relevance, specificity, opportunityGrounding].filter(
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
    specificity,
    opportunityGrounding,
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
