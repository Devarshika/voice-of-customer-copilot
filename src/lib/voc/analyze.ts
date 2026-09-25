import {
  corpusCommonTerms,
  extractComplaintSignatures,
  normalizedWords,
  problemKindLabel,
  setSimilarity,
  signatureCompatibility,
  type ComplaintSignature,
  type ProblemKind,
} from "./complaints";
import type {
  Analysis,
  ChurnEvidence,
  Confidence,
  Excerpt,
  Insight,
  MonthPoint,
  OpportunityEvidence,
  OpportunityItem,
  PainPoint,
  PriorityItem,
  Review,
  TrendEvidence,
} from "./types";

/**
 * Deterministic, dataset-agnostic Voice of Customer analysis.
 * No product, company, industry, or expected-result vocabulary is encoded here.
 */

type SignatureGroup = {
  kind: ProblemKind;
  signatures: ComplaintSignature[];
  reviewIds: Set<string>;
  contexts: Map<string, number>;
};

type Theme = {
  id: string;
  kind: ProblemKind;
  label: string;
  problem: string;
  signatures: ComplaintSignature[];
  reviewIds: string[];
  representativeSentences: string[];
  contexts: string[];
  cohesion: number;
  completeness: number;
  severityShare: number;
};

const CHURN_RULES: { label: string; patterns: RegExp[] }[] = [
  {
    label: "Explicit intent to stop using the product",
    patterns: [
      /\b(?:i |we )?(?:will |am going to |are going to )?(?:stop|quit) (?:using|buying|ordering|paying)\b/i,
      /\b(?:i |we )?(?:will not|won't|wont|never) (?:use|buy|order|return)\b/i,
      /\b(?:uninstall|deleting|delete|deleted) (?:this |the )?(?:app|account)\b/i,
      /\b(?:done with|not coming back|no longer using|last time using)\b/i,
    ],
  },
  {
    label: "Switching to an alternative",
    patterns: [
      /\b(?:switching|switched|moving|moved|going) to (?:another|a different|an alternative|a competitor)\b/i,
      /\b(?:use|using|choose|choosing) (?:another|a different|an alternative|a competitor).{0,24}\binstead\b/i,
      /\bbetter alternative\b/i,
    ],
  },
  {
    label: "Cancellation or account exit intent",
    patterns: [
      /\b(?:cancel|close|delete) (?:my |the )?(?:subscription|membership|account)\b/i,
      /\b(?:unsubscribe|terminate my account)\b/i,
    ],
  },
  {
    label: "Repeated unresolved dissatisfaction",
    patterns: [
      /\b(?:every time|again and again|repeatedly|multiple times|third time)\b.{0,70}\b(?:fail|problem|issue|wrong|broken|unresolved|not fixed)\b/i,
      /\b(?:still not fixed|never gets resolved|keeps happening)\b/i,
    ],
  },
];

const CHURN_FALSE_CONTEXT = /\b(?:not|never|won't|wont|wouldn't|wouldnt) (?:stop|quit|switch|leave)|\b(?:but|although|however)\b.{0,45}\b(?:stay|staying|keep using|continue using)\b/i;

function thresholds(total: number) {
  const root = Math.sqrt(Math.max(total, 1));
  return {
    pain: Math.max(3, Math.min(140, Math.round(root * 0.45))),
    trend: Math.max(8, Math.min(180, Math.round(root * 0.58))),
    churn: Math.max(2, Math.min(70, Math.round(root * 0.2))),
  };
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}

function surfaceWord(stem: string, sentences: string[]): string {
  const candidates = sentences
    .flatMap((sentence) => sentence.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
    .filter((word) => normalizedWords(word)[0] === stem);
  if (candidates.length === 0) return stem;
  const counts = new Map<string, number>();
  for (const candidate of candidates) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? stem;
}

function buildSeedGroups(signatures: ComplaintSignature[], minEvidence: number): SignatureGroup[] {
  const groups = new Map<string, SignatureGroup>();
  for (const signature of signatures) {
    const key = `${signature.kind}|${signature.context.slice().sort().join("|")}`;
    const existing = groups.get(key);
    if (existing) {
      existing.signatures.push(signature);
      existing.reviewIds.add(signature.reviewId);
      signature.context.forEach((context, index) => existing.contexts.set(context, (existing.contexts.get(context) ?? 0) + (index === 0 ? 2 : 1)));
    } else {
      groups.set(key, {
        kind: signature.kind,
        signatures: [signature],
        reviewIds: new Set([signature.reviewId]),
        contexts: new Map(signature.context.map((context, index) => [context, index === 0 ? 2 : 1])),
      });
    }
  }
  return [...groups.values()].filter((group) => group.reviewIds.size >= Math.max(2, Math.floor(minEvidence * 0.45)));
}

function evidenceOverlap(left: Set<string>, right: Set<string>): number {
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  let shared = 0;
  for (const id of smaller) if (larger.has(id)) shared += 1;
  return smaller.size ? shared / smaller.size : 0;
}

function groupSimilarity(left: SignatureGroup, right: SignatureGroup): number {
  if (left.kind !== right.kind) return 0;
  const context = setSimilarity(left.contexts.keys(), right.contexts.keys());
  const overlap = evidenceOverlap(left.reviewIds, right.reviewIds);
  if (overlap >= 0.5) return 0.9;
  const leftPrimary = [...left.contexts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const rightPrimary = [...right.contexts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (leftPrimary && leftPrimary === rightPrimary) return 0.78;
  const leftTop = left.signatures.slice(0, 20);
  const rightTop = right.signatures.slice(0, 20);
  let bestSignature = 0;
  for (const a of leftTop) for (const b of rightTop) bestSignature = Math.max(bestSignature, signatureCompatibility(a, b));
  if (context === 0 && overlap < 0.22) return 0;
  return context * 0.5 + overlap * 0.3 + bestSignature * 0.2;
}

function mergeGroups(left: SignatureGroup, right: SignatureGroup): SignatureGroup {
  const contexts = new Map(left.contexts);
  for (const [context, count] of right.contexts) contexts.set(context, (contexts.get(context) ?? 0) + count);
  return {
    kind: left.kind,
    signatures: [...left.signatures, ...right.signatures],
    reviewIds: new Set([...left.reviewIds, ...right.reviewIds]),
    contexts,
  };
}

function mergeBestFirst(seedGroups: SignatureGroup[]): SignatureGroup[] {
  const groups = [...seedGroups];
  while (true) {
    let best: { left: number; right: number; score: number } | null = null;
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const a = groups[left];
        const b = groups[right];
        if (!a || !b) continue;
        const score = groupSimilarity(a, b);
        if (score >= 0.44 && (!best || score > best.score)) best = { left, right, score };
      }
    }
    if (!best) return groups;
    const left = groups[best.left];
    const right = groups[best.right];
    if (!left || !right) return groups;
    groups.splice(best.right, 1);
    groups.splice(best.left, 1, mergeGroups(left, right));
  }
}

function clusterCohesion(group: SignatureGroup): number {
  const rankedContexts = [...group.contexts].sort((a, b) => b[1] - a[1]);
  const dominant = new Set(rankedContexts.slice(0, 3).map(([context]) => context));
  const compatible = group.signatures.filter((signature) => signature.context.some((context) => dominant.has(context))).length;
  return group.signatures.length ? compatible / group.signatures.length : 0;
}

function discoverThemes(reviews: Review[], minEvidence: number): Theme[] {
  const common = corpusCommonTerms(reviews);
  const signatures = reviews.flatMap((review) => extractComplaintSignatures(review, common));
  const groups = mergeBestFirst(buildSeedGroups(signatures, minEvidence));

  return groups
    .filter((group) => group.reviewIds.size >= minEvidence)
    .map((group) => {
      const reviewIds = [...group.reviewIds];
      const contexts = [...group.contexts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([context]) => context);
      const representativeSignatures = [...group.signatures].sort(
        (a, b) => b.completeness - a.completeness || Number(b.severity) - Number(a.severity) || a.sentence.localeCompare(b.sentence),
      );
      const representativeSentences = [...new Set(representativeSignatures.map((signature) => signature.sentence))].slice(0, 8);
      const mainContextStem = contexts[0];
      if (!mainContextStem) return null;
      const context = surfaceWord(mainContextStem, representativeSentences);
      const label = titleCase(`${context} ${problemKindLabel(group.kind)}`);
      const cohesion = clusterCohesion(group);
      const completeness = group.signatures.reduce((sum, signature) => sum + signature.completeness, 0) / group.signatures.length;
      const severeReviews = new Set(group.signatures.filter((signature) => signature.severity).map((signature) => signature.reviewId));
      const supportingExamples = representativeSentences.slice(0, 2).map((sentence) => `“${sentence}”`).join(" and ");
      return {
        id: stableId(`${group.kind}|${contexts.slice(0, 3).join("|")}`),
        kind: group.kind,
        label,
        problem: `${reviewIds.length.toLocaleString()} reviews describe ${context.toLowerCase()} ${problemKindLabel(group.kind).toLowerCase()}. Representative evidence includes ${supportingExamples}.`,
        signatures: group.signatures,
        reviewIds,
        representativeSentences,
        contexts,
        cohesion,
        completeness,
        severityShare: reviewIds.length ? severeReviews.size / reviewIds.length : 0,
      } satisfies Theme;
    })
    .filter((theme): theme is Theme => theme !== null)
    .filter((theme) => theme.cohesion >= 0.68 && theme.completeness >= 0.68)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length || b.cohesion - a.cohesion)
    .filter((theme, index, all) => {
      return !all.slice(0, index).some((prior) => {
        if (prior.kind !== theme.kind) return false;
        const contextSimilarity = setSimilarity(prior.contexts.slice(0, 3), theme.contexts.slice(0, 3));
        const overlap = evidenceOverlap(new Set(prior.reviewIds), new Set(theme.reviewIds));
        return prior.label.toLowerCase() === theme.label.toLowerCase() || contextSimilarity >= 0.5 || overlap >= 0.5;
      });
    })
    .slice(0, 18);
}

function reviewNegativeShare(reviews: Review[]): { share: number; basis: "ratings" | "complaint evidence"; rated: number } {
  const rated = reviews.filter((review): review is Review & { rating: number } => review.rating !== null);
  if (rated.length > 0) {
    return { share: rated.filter((review) => review.rating <= 2).length / rated.length, basis: "ratings", rated: rated.length };
  }
  return { share: reviews.length ? 1 : 0, basis: "complaint evidence", rated: 0 };
}

function buildInsight(id: string, label: string, reviews: Review[]): Insight | null {
  if (reviews.length === 0) return null;
  const rated = reviews.filter((review): review is Review & { rating: number } => review.rating !== null);
  return {
    id,
    label,
    reviewIds: [...new Set(reviews.map((review) => review.id))],
    negativeShare: reviewNegativeShare(reviews).share,
    avgRating: rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null,
  };
}

function excerpt(review: Review, sentence: string): Excerpt {
  const text = review.text.trim();
  const at = text.toLowerCase().indexOf(sentence.toLowerCase());
  if (at < 0 || text.length <= 240) return { reviewId: review.id, text, date: review.date };
  const start = Math.max(0, at - 70);
  const end = Math.min(text.length, at + sentence.length + 90);
  return {
    reviewId: review.id,
    text: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`,
    date: review.date,
  };
}

type TimeContext = { from: number; to: number; split: number; earlierReviews: number; recentReviews: number };

function buildTimeContext(reviews: Review[]): TimeContext | null {
  const dates = reviews.map((review) => (review.date ? Date.parse(review.date) : NaN)).filter(Number.isFinite);
  if (dates.length < 2) return null;
  const from = Math.min(...dates);
  const to = Math.max(...dates);
  if (from === to) return null;
  const split = from + (to - from) / 2;
  return {
    from,
    to,
    split,
    earlierReviews: dates.filter((date) => date < split).length,
    recentReviews: dates.filter((date) => date >= split).length,
  };
}

function monthKey(time: number): string {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildTrend(matched: Review[], time: TimeContext | null, minEvidence: number): TrendEvidence {
  const dates = matched.map((review) => (review.date ? Date.parse(review.date) : NaN)).filter(Number.isFinite);
  if (!time || dates.length < minEvidence || time.earlierReviews < minEvidence || time.recentReviews < minEvidence) return { evidence: false };
  const earlier = dates.filter((date) => date < time.split).length;
  const recent = dates.length - earlier;
  const floor = Math.max(4, Math.ceil(minEvidence * 0.35));
  if (earlier < floor || recent < floor) return { evidence: false };
  const earlierRate = earlier / time.earlierReviews;
  const recentRate = recent / time.recentReviews;
  const changePct = ((recentRate - earlierRate) / earlierRate) * 100;
  if (!Number.isFinite(changePct)) return { evidence: false };
  const buckets = new Map<string, number>();
  for (const date of dates) buckets.set(monthKey(date), (buckets.get(monthKey(date)) ?? 0) + 1);
  const months: MonthPoint[] = [...buckets].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  return {
    evidence: true,
    earlier,
    recent,
    changePct,
    direction: changePct > 15 ? "rising" : changePct < -15 ? "falling" : "steady",
    months,
    window: { from: new Date(time.from).toISOString().slice(0, 10), to: new Date(time.to).toISOString().slice(0, 10) },
  };
}

function churnMatches(review: Review): string[] {
  const labels = new Set<string>();
  const sentences = review.text.split(/[.!?;\n]+/).map((sentence) => sentence.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (CHURN_FALSE_CONTEXT.test(sentence)) continue;
    for (const rule of CHURN_RULES) if (rule.patterns.some((pattern) => pattern.test(sentence))) labels.add(rule.label);
  }
  return [...labels];
}

function churnEvidence(reviews: Review[], minEvidence: number): ChurnEvidence {
  const labels = new Map<string, string[]>();
  for (const review of reviews) {
    const matched = churnMatches(review);
    if (matched.length > 0) labels.set(review.id, matched);
  }
  if (labels.size < minEvidence) return { evidence: false };
  return {
    evidence: true,
    reviewIds: [...labels.keys()],
    share: reviews.length ? labels.size / reviews.length : 0,
    signals: [...new Set([...labels.values()].flat())].slice(0, 3),
  };
}

function buildConfidence(theme: Theme, total: number, minEvidence: number, ratedCount: number): Confidence {
  const supportStrength = Math.min(1, theme.reviewIds.length / Math.max(minEvidence * 3, 1));
  const quality = theme.cohesion * 0.55 + theme.completeness * 0.45;
  const ratingCoverage = theme.reviewIds.length ? ratedCount / theme.reviewIds.length : 0;
  const level: Confidence["level"] = supportStrength >= 0.75 && quality >= 0.78 ? "High" : supportStrength >= 0.4 && quality >= 0.7 ? "Moderate" : "Low";
  return {
    level,
    basis: `${theme.reviewIds.length.toLocaleString()} linked reviews (${total ? ((theme.reviewIds.length / total) * 100).toFixed(1) : "0.0"}% of the dataset); ${Math.round(theme.cohesion * 100)}% cluster cohesion; ${Math.round(theme.completeness * 100)}% proposition completeness; ${ratedCount.toLocaleString()} carry ratings (${Math.round(ratingCoverage * 100)}%).`,
  };
}

function opportunityStatement(theme: Theme): string | null {
  const contextStem = theme.contexts[0];
  if (!contextStem || theme.cohesion < 0.72 || theme.completeness < 0.7) return null;
  const context = surfaceWord(contextStem, theme.representativeSentences).toLowerCase();
  const consequences = [...new Set(theme.signatures.flatMap((signature) => signature.consequence))];
  const consequence = consequences[0];
  const outcome = consequence
    ? ` so customers are less likely to ${surfaceWord(consequence, theme.representativeSentences).toLowerCase()}`
    : "";
  const statements: Record<ProblemKind, string | null> = {
    blocked: `Explore removing the blocking step around ${context} and offering an alternate completion path${outcome}.`,
    cancelled: `Explore reducing avoidable ${context} cancellations through earlier confirmation and a clear recovery path${outcome}.`,
    confusing: `Explore clarifying ${context} decisions with contextual guidance and explicit status cues${outcome}.`,
    incorrect: `Explore validating ${context} before completion and giving customers a direct correction path${outcome}.`,
    missing: `Explore making ${context} status traceable and enabling direct resolution when it is missing${outcome}.`,
    quality: consequence ? `Explore targeted quality controls around ${context} that address the observed ${consequence} consequence.` : null,
    reliability: `Explore preventing ${context} failures and preserving progress through a recoverable retry path${outcome}.`,
    slow: `Explore reducing wait time for ${context} and showing progress when processing takes longer than expected${outcome}.`,
    unavailable: `Explore earlier availability checks and a useful fallback when ${context} cannot be provided${outcome}.`,
    unsafe: `Explore stronger verification and incident-reporting controls around ${context}${outcome}.`,
  };
  return statements[theme.kind];
}

function buildOpportunity(theme: Theme, reviewIds: string[], excerpts: Excerpt[]): OpportunityEvidence {
  const statement = opportunityStatement(theme);
  if (!statement || excerpts.length < 2) return { evidence: false };
  return { evidence: true, statement, reviewIds, excerpts: excerpts.slice(0, 3) };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function analyze(reviews: Review[]): Analysis {
  const total = reviews.length;
  const limits = thresholds(total);
  const byId = new Map(reviews.map((review) => [review.id, review]));
  const time = buildTimeContext(reviews);
  const themes = discoverThemes(reviews, limits.pain);

  const prepared = themes.map((theme) => {
    const matched = theme.reviewIds.map((id) => byId.get(id)).filter((review): review is Review => !!review);
    const insight = buildInsight(`theme-${theme.id}`, theme.label, matched);
    if (!insight) return null;
    const ratedCount = matched.filter((review) => review.rating !== null).length;
    const signatureByReview = new Map<string, ComplaintSignature>();
    for (const signature of theme.signatures) {
      const existing = signatureByReview.get(signature.reviewId);
      if (!existing || signature.completeness > existing.completeness) signatureByReview.set(signature.reviewId, signature);
    }
    const excerptCandidates = [...signatureByReview.values()]
      .sort((a, b) => b.completeness - a.completeness || Number(b.severity) - Number(a.severity))
      .slice(0, 4);
    const excerpts = excerptCandidates
      .map((signature) => {
        const review = byId.get(signature.reviewId);
        return review ? excerpt(review, signature.sentence) : null;
      })
      .filter((item): item is Excerpt => item !== null);
    const trend = buildTrend(matched, time, limits.trend);
    const confidence = buildConfidence(theme, total, limits.pain, ratedCount);
    const opportunity = buildOpportunity(theme, insight.reviewIds, excerpts);
    const negativity = reviewNegativeShare(matched);
    const support = clamp(theme.reviewIds.length / Math.max(limits.pain * 4, 1));
    const trendChange = trend.evidence ? trend.changePct : null;
    const trendFactor = trend.evidence && trend.direction === "rising" && trendChange !== null && trendChange > 0 ? clamp(trendChange / 100) : 0;
    const evidenceQuality = theme.cohesion * 0.55 + theme.completeness * 0.45;
    const confidenceFactor = confidence.level === "High" ? 1 : confidence.level === "Moderate" ? 0.65 : 0.3;
    const score = Math.round((support * 0.28 + negativity.share * 0.22 + trendFactor * 0.14 + evidenceQuality * 0.24 + theme.severityShare * 0.07 + confidenceFactor * 0.05) * 100);
    return { theme, insight, matched, excerpts, trend, confidence, opportunity, negativity, support, trendFactor, evidenceQuality, score };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  prepared.sort((a, b) => b.score - a.score || b.insight.reviewIds.length - a.insight.reviewIds.length);
  const painPoints: PainPoint[] = prepared.map((item, index) => ({
    ...item.insight,
    description: item.theme.problem,
    keywords: item.theme.representativeSentences,
    mentionCount: item.insight.reviewIds.length,
    datasetShare: total ? item.insight.reviewIds.length / total : 0,
    excerpts: item.excerpts,
    trend: item.trend,
    confidence: item.confidence,
    churn: churnEvidence(item.matched, Math.max(2, Math.min(limits.churn, Math.ceil(item.matched.length * 0.12)))),
    priority: {
      score: item.score,
      rank: index + 1,
      impact: item.score >= 72 && item.confidence.level !== "Low" ? "High" : item.score >= 48 ? "Medium" : "Low",
      rationale: `Evidence index: support ${Math.round(item.support * 100)}/100, negative share ${Math.round(item.negativity.share * 100)}/100 (${item.negativity.basis}), reliable rising trend ${Math.round(item.trendFactor * 100)}/100, evidence quality ${Math.round(item.evidenceQuality * 100)}/100, severity ${Math.round(item.theme.severityShare * 100)}/100, and ${item.confidence.level.toLowerCase()} confidence.`,
    },
    opportunity: item.opportunity,
  }));

  const trends = painPoints
    .filter((pain) => pain.trend.evidence && pain.trend.direction === "rising" && pain.trend.changePct !== null && pain.trend.changePct >= 20 && pain.trend.recent - pain.trend.earlier >= Math.max(4, Math.ceil(limits.trend * 0.2)))
    .map((pain) => {
      if (!pain.trend.evidence) return null;
      return { id: `trend-${pain.id}`, label: pain.label, reviewIds: pain.reviewIds, negativeShare: pain.negativeShare, avgRating: pain.avgRating, recent: pain.trend.recent, earlier: pain.trend.earlier, changePct: pain.trend.changePct };
    })
    .filter((trend): trend is NonNullable<typeof trend> => trend !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  const churnSignals = CHURN_RULES.map((rule, index) => {
    const matched = reviews.filter((review) => churnMatches(review).includes(rule.label));
    return buildInsight(`churn-${index}`, rule.label, matched);
  }).filter((insight): insight is Insight => !!insight && insight.reviewIds.length >= limits.churn)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  const priorities: PriorityItem[] = painPoints.slice(0, 5).map((pain) => ({ ...pain, id: `prio-${pain.id}`, score: pain.priority.score, impact: pain.priority.impact }));
  const opportunities: OpportunityItem[] = painPoints
    .filter((pain) => pain.opportunity.evidence)
    .map((pain) => ({
      id: `opp-${pain.id}`,
      label: pain.opportunity.evidence ? pain.opportunity.statement : pain.label,
      painLabel: pain.label,
      painPointId: pain.id,
      reviewIds: pain.reviewIds,
      negativeShare: pain.negativeShare,
      avgRating: pain.avgRating,
    }))
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  const rated = reviews.filter((review): review is Review & { rating: number } => review.rating !== null);
  const dated = reviews.map((review) => (review.date ? Date.parse(review.date) : NaN)).filter(Number.isFinite);
  const negative = reviewNegativeShare(reviews);
  return {
    kpis: {
      reviewCount: total,
      ratedCount: rated.length,
      avgRating: rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null,
      negativeShare: total ? negative.share : null,
      themeCount: painPoints.length,
      dateRange: dated.length ? { from: new Date(Math.min(...dated)).toISOString().slice(0, 10), to: new Date(Math.max(...dated)).toISOString().slice(0, 10) } : null,
    },
    painPoints,
    trends,
    churnSignals,
    priorities,
    opportunities,
  };
}

type Group = { kind: string; items: Insight[] };
const evidenceIndex = new WeakMap<Analysis, Map<string, Group[]>>();

function buildIndex(analysis: Analysis): Map<string, Group[]> {
  const cached = evidenceIndex.get(analysis);
  if (cached) return cached;
  const groups: Group[] = [
    { kind: "Pain point", items: analysis.painPoints },
    { kind: "Emerging trend", items: analysis.trends },
    { kind: "Churn signal", items: analysis.churnSignals },
    { kind: "Prioritized", items: analysis.priorities },
    { kind: "Opportunity", items: analysis.opportunities },
  ];
  const index = new Map<string, Group[]>();
  for (const group of groups) for (const insight of group.items) for (const id of insight.reviewIds) {
    const existing = index.get(id);
    if (!existing) index.set(id, [{ kind: group.kind, items: [insight] }]);
    else {
      const matching = existing.find((entry) => entry.kind === group.kind);
      if (matching) matching.items.push(insight);
      else existing.push({ kind: group.kind, items: [insight] });
    }
  }
  evidenceIndex.set(analysis, index);
  return index;
}

export function insightsForReview(analysis: Analysis, reviewId: string): Group[] {
  return buildIndex(analysis).get(reviewId) ?? [];
}

export function insightCountForReview(analysis: Analysis, reviewId: string): number {
  return insightsForReview(analysis, reviewId).reduce((count, group) => count + group.items.length, 0);
}
