import {
  contentWords,
  corpusCommonTerms,
  describesProblem,
  extractComplaintSignatures,
  isConcreteComplaint,
  setSimilarity,
  signatureCompatibility,
  type ComplaintSignature,
} from "./complaints";
import type { Analysis, PainPoint, Review } from "./types";

export type CheckResult =
  | { evaluated: false }
  | {
      evaluated: true;
      passed: number;
      checked: number;
      ratio: number;
      status: "Pass" | "Warn" | "Fail";
      detail: string;
      method: "exact" | "heuristic";
    };

export type Flag = { insightId: string; insightLabel: string; reviewIds: string[]; reason: string };

export type Evaluation = {
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

const REVIEWS_PER_INSIGHT = 120;
const notEvaluated: CheckResult = { evaluated: false };
const INTERVENTION = /\b(?:check|clarif|control|correct|fallback|guidance|prevent|progress|recover|reduc|resolution|retry|status|trace|validat|verif)\w*\b/i;

function result(passed: number, checked: number, detail: string, method: "exact" | "heuristic" = "exact"): CheckResult {
  if (checked === 0) return notEvaluated;
  const ratio = passed / checked;
  return { evaluated: true, passed, checked, ratio, status: ratio >= 0.9 ? "Pass" : ratio >= 0.7 ? "Warn" : "Fail", detail, method };
}

function cleanExcerpt(text: string): string {
  return text.replace(/^…|…$/g, "").trim().toLowerCase();
}

function dominantSignature(signatures: ComplaintSignature[]): { kind: ComplaintSignature["kind"]; contexts: string[]; mechanisms: string[] } | null {
  if (signatures.length < 2) return null;
  const kinds = new Map<ComplaintSignature["kind"], number>();
  const contexts = new Map<string, Set<string>>();
  const mechanisms = new Map<string, Set<string>>();
  for (const signature of signatures) {
    kinds.set(signature.kind, (kinds.get(signature.kind) ?? 0) + 1);
    const mechanism = `${signature.kind}|${signature.relatedKinds.slice().sort().join("+")}`;
    const mechanismIds = mechanisms.get(mechanism) ?? new Set<string>();
    mechanismIds.add(signature.reviewId);
    mechanisms.set(mechanism, mechanismIds);
    for (const context of signature.context) {
      const ids = contexts.get(context) ?? new Set<string>();
      ids.add(signature.reviewId);
      contexts.set(context, ids);
    }
  }
  const kind = [...kinds].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!kind) return null;
  const dominantContexts = [...contexts]
    .filter(([, ids]) => ids.size >= Math.max(2, Math.ceil(signatures.length * 0.18)))
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 4)
    .map(([context]) => context);
  const dominantMechanisms = [...mechanisms]
    .filter(([, ids]) => ids.size >= Math.max(2, Math.ceil(signatures.length * 0.18)))
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 3)
    .map(([mechanism]) => mechanism);
  return dominantContexts.length > 0 && dominantMechanisms.length > 0 ? { kind, contexts: dominantContexts, mechanisms: dominantMechanisms } : null;
}

function supportsCentroid(signatures: ComplaintSignature[], centroid: NonNullable<ReturnType<typeof dominantSignature>>): boolean {
  return signatures.some((signature) => {
    const mechanism = `${signature.kind}|${signature.relatedKinds.slice().sort().join("+")}`;
    if (signature.kind !== centroid.kind) return false;
    return centroid.mechanisms.some((candidate) => {
      const related = candidate.split("|")[1]?.split("+").filter(Boolean) ?? [];
      return mechanism === candidate || (signature.relatedKinds.length > 0 && related.some((kind) => signature.relatedKinds.includes(kind as ComplaintSignature["kind"])));
    });
  });
}

function opportunitySkeleton(statement: string): string {
  return contentWords(statement)
    .filter((word) => INTERVENTION.test(word))
    .sort()
    .join("|");
}

function evidenceOverlap(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const smaller = a.size <= b.size ? a : b;
  let shared = 0;
  for (const id of smaller) if ((smaller === a ? b : a).has(id)) shared += 1;
  return smaller.size ? shared / smaller.size : 0;
}

function approximatelyEqual(left: number, right: number, tolerance = 0.0001): boolean {
  return Math.abs(left - right) <= tolerance;
}

export function evaluate(reviews: Review[], analysis: Analysis): Evaluation {
  const byId = new Map(reviews.map((review) => [review.id, review]));
  const common = corpusCommonTerms(reviews);
  const signaturesByReview = new Map<string, ComplaintSignature[]>();
  for (const review of reviews) signaturesByReview.set(review.id, extractComplaintSignatures(review, common));
  const sampled = analysis.painPoints;
  const opportunitySkeletonCounts = new Map<string, number>();
  for (const pain of sampled) {
    if (!pain.opportunity.evidence) continue;
    const skeleton = opportunitySkeleton(pain.opportunity.statement);
    opportunitySkeletonCounts.set(skeleton, (opportunitySkeletonCounts.get(skeleton) ?? 0) + 1);
  }

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
  const centroids = new Map<string, NonNullable<ReturnType<typeof dominantSignature>>>();

  for (const pain of sampled) {
    let insightEvaluated = false;
    const missing: string[] = [];
    for (const id of pain.reviewIds) {
      groundedChecked += 1;
      const review = byId.get(id);
      if (review?.text.trim()) groundedPass += 1;
      else if (missing.length < 3) missing.push(id);
    }
    if (pain.reviewIds.length > 0) insightEvaluated = true;
    if (missing.length > 0) flags.push({ insightId: pain.id, insightLabel: pain.label, reviewIds: missing, reason: "Linked review IDs do not resolve to review text in the selected dataset." });

    const linkedSignatures = pain.reviewIds.flatMap((id) => signaturesByReview.get(id) ?? []);
    const centroid = dominantSignature(linkedSignatures);
    if (centroid) centroids.set(pain.id, centroid);
    const sampledIds = pain.reviewIds.slice(0, REVIEWS_PER_INSIGHT);
    const offTheme: string[] = [];
    if (centroid && sampledIds.length >= 3) {
      for (const id of sampledIds) {
        const own = signaturesByReview.get(id) ?? [];
        const peers = linkedSignatures.filter((signature) => signature.reviewId !== id);
        const leaveOneOut = dominantSignature(peers);
        if (!leaveOneOut) continue;
        consistentChecked += 1;
        if (supportsCentroid(own, leaveOneOut)) consistentPass += 1;
        else if (offTheme.length < 3) offTheme.push(id);
      }
    }
    if (offTheme.length > 0) flags.push({ insightId: pain.id, insightLabel: pain.label, reviewIds: offTheme, reason: "Sampled reviews do not match the problem kind and affected context established by the other reviews in this cluster." });

    if (centroid) {
      for (const evidence of pain.excerpts) {
        relevantChecked += 1;
        const review = byId.get(evidence.reviewId);
        const snippet = cleanExcerpt(evidence.text);
        const verbatim = !!review && review.text.toLowerCase().includes(snippet);
        const linked = pain.reviewIds.includes(evidence.reviewId);
        const evidenceSignatures = review ? (signaturesByReview.get(review.id) ?? []).filter((signature) => signature.sentence.toLowerCase().includes(snippet) || snippet.includes(signature.sentence.toLowerCase())) : [];
        const propositionRelevant = supportsCentroid(evidenceSignatures, centroid);
        if (review && verbatim && linked && propositionRelevant) relevantPass += 1;
        else flags.push({
          insightId: pain.id,
          insightLabel: pain.label,
          reviewIds: [evidence.reviewId],
          reason: !review ? "Excerpt cites an unknown review ID." : !verbatim ? "Excerpt is not verbatim review text." : !linked ? "Excerpt is outside this insight's evidence set." : "Excerpt does not express the cluster's underlying problem proposition.",
        });
      }
    }

    specificChecked += 1;
    const labelSpecific = describesProblem(pain.label);
    const contextSpecific = centroid ? centroid.contexts.some((context) => contentWords(context).length > 0) : false;
    const concreteReviews = new Set(linkedSignatures.filter(isConcreteComplaint).map((signature) => signature.reviewId));
    const concreteShare = pain.reviewIds.length ? concreteReviews.size / pain.reviewIds.length : 0;
    const propositionSpecific = centroid ? centroid.kind !== "quality" || concreteShare >= 0.55 : false;
    if (labelSpecific && contextSpecific && propositionSpecific) specificPass += 1;
    else flags.push({ insightId: pain.id, insightLabel: pain.label, reviewIds: pain.reviewIds.slice(0, 3), reason: "Insight is generic, incomplete, or does not name both an affected context and a customer problem." });

    if (pain.opportunity.evidence && centroid) {
      opportunityChecked += 1;
      const opportunity = pain.opportunity;
      const statementWords = contentWords(opportunity.statement);
      const contextLinked = setSimilarity(statementWords, centroid.contexts) > 0;
      const actionable = INTERVENTION.test(opportunity.statement);
      const overlapWithLabel = setSimilarity(statementWords, contentWords(pain.label));
      const lineageValid = opportunity.reviewIds.length > 0 && opportunity.reviewIds.every((id) => pain.reviewIds.includes(id) && byId.has(id));
      const excerptsValid = opportunity.excerpts.length >= 2 && opportunity.excerpts.every((item) => opportunity.reviewIds.includes(item.reviewId));
      const skeleton = opportunitySkeleton(opportunity.statement);
      const duplicated = skeleton.length > 0 && (opportunitySkeletonCounts.get(skeleton) ?? 0) >= 2;
      if (contextLinked && actionable && overlapWithLabel < 0.72 && lineageValid && excerptsValid && !duplicated) opportunityPass += 1;
      else flags.push({ insightId: pain.id, insightLabel: pain.label, reviewIds: opportunity.reviewIds.slice(0, 3), reason: duplicated ? "Opportunity repeats the same intervention structure used for another problem." : "Opportunity is generic, repetitive, unsupported, or does not logically address the evidenced problem context." });
    }

    claimsChecked += 1;
    if (pain.mentionCount !== new Set(pain.reviewIds).size) {
      unsupported += 1;
      flags.push({ insightId: pain.id, insightLabel: pain.label, reviewIds: pain.reviewIds.slice(0, 3), reason: "Mention count does not match the unique supporting-review count." });
    }

    claimsChecked += 1;
    const expectedShare = reviews.length ? new Set(pain.reviewIds).size / reviews.length : 0;
    if (!approximatelyEqual(pain.datasetShare, expectedShare)) {
      unsupported += 1;
      flags.push({ insightId: pain.id, insightLabel: pain.label, reviewIds: pain.reviewIds.slice(0, 3), reason: "Dataset percentage does not match the linked evidence count." });
    }

    const linkedReviews = pain.reviewIds.map((id) => byId.get(id)).filter((review): review is Review => !!review);
    const rated = linkedReviews.filter((review): review is Review & { rating: number } => review.rating !== null);
    claimsChecked += 1;
    if (rated.length > 0) {
      const expectedNegative = rated.filter((review) => review.rating <= 2).length / rated.length;
      if (!approximatelyEqual(pain.negativeShare, expectedNegative)) unsupported += 1;
    }

    claimsChecked += 1;
    if (pain.avgRating !== null) {
      const expectedAverage = rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null;
      if (expectedAverage === null || !approximatelyEqual(pain.avgRating, expectedAverage)) unsupported += 1;
    }

    claimsChecked += 1;
    if (pain.trend.evidence) {
      const datasetDates = reviews.map((review) => (review.date ? Date.parse(review.date) : NaN)).filter(Number.isFinite);
      if (datasetDates.length < 2) unsupported += 1;
      else {
        const split = Math.min(...datasetDates) + (Math.max(...datasetDates) - Math.min(...datasetDates)) / 2;
        const linkedDates = linkedReviews.map((review) => (review.date ? Date.parse(review.date) : NaN)).filter(Number.isFinite);
        const earlier = linkedDates.filter((date) => date < split).length;
        const recent = linkedDates.length - earlier;
        if (earlier !== pain.trend.earlier || recent !== pain.trend.recent) unsupported += 1;
      }
    }

    claimsChecked += 1;
    if (pain.churn.evidence && pain.churn.reviewIds.some((id) => !pain.reviewIds.includes(id) || !byId.has(id))) unsupported += 1;

    claimsChecked += 1;
    if (pain.opportunity.evidence && pain.opportunity.reviewIds.some((id) => !pain.reviewIds.includes(id) || !byId.has(id))) unsupported += 1;

    if (insightEvaluated && (centroid || specificChecked > 0)) evaluatedInsights += 1;
  }

  for (let leftIndex = 0; leftIndex < sampled.length; leftIndex += 1) {
    const left = sampled[leftIndex];
    if (!left) continue;
    const leftCentroid = centroids.get(left.id);
    if (!leftCentroid) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < sampled.length; rightIndex += 1) {
      const right = sampled[rightIndex];
      if (!right) continue;
      const rightCentroid = centroids.get(right.id);
      if (!rightCentroid || leftCentroid.kind !== rightCentroid.kind) continue;
      const sameMechanism = setSimilarity(leftCentroid.mechanisms, rightCentroid.mechanisms) > 0;
      const contextSimilarity = setSimilarity(leftCentroid.contexts, rightCentroid.contexts);
      const overlap = evidenceOverlap(left.reviewIds, right.reviewIds);
      if (!sameMechanism || contextSimilarity < 0.5 || overlap < 0.42) continue;
      consistentChecked += 1;
      flags.push({
        insightId: right.id,
        insightLabel: right.label,
        reviewIds: right.reviewIds.filter((id) => left.reviewIds.includes(id)).slice(0, 3),
        reason: `Potential semantic duplicate of “${left.label}”: both insights retain the same failure mechanism and substantially overlapping context or evidence.`,
      });
    }
  }

  const grounding = result(groundedPass, groundedChecked, "Linked review IDs resolving to non-empty review text");
  const consistency = result(consistentPass, consistentChecked, "Leave-one-out agreement plus final semantic duplicate rejection across problem mechanisms", "heuristic");
  const relevance = result(relevantPass, relevantChecked, "Verbatim excerpts expressing the cluster's problem proposition", "heuristic");
  const specificity = result(specificPass, specificChecked, "Insights naming a concrete failure proposition and affected customer context, with vague quality-only evidence rejected", "heuristic");
  const opportunityGrounding = result(opportunityPass, opportunityChecked, "Evidence-linked interventions with valid lineage and no repeated intervention structure", "heuristic");
  const checks = [grounding, consistency, relevance, specificity, opportunityGrounding].filter((check): check is Extract<CheckResult, { evaluated: true }> => check.evaluated);
  const overall: Evaluation["overall"] = reviews.length === 0 || sampled.length === 0 || checks.length === 0
    ? "Not evaluated"
    : checks.some((check) => check.status === "Fail") || unsupported > 0
      ? "Fail"
      : checks.some((check) => check.status === "Warn")
        ? "Warn"
        : "Pass";

  return {
    sample: { insights: sampled.length, insightsAvailable: analysis.painPoints.length, reviewsChecked: consistentChecked },
    grounding,
    consistency,
    relevance,
    specificity,
    opportunityGrounding,
    unsupportedClaims: { evaluated: claimsChecked > 0, count: unsupported, checked: claimsChecked },
    coverage: { evaluatedInsights, totalInsights: sampled.length, ratio: sampled.length ? evaluatedInsights / sampled.length : null },
    flags: flags.slice(0, 30),
    overall,
  };
}
