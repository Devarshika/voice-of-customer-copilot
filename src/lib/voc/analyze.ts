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
 * Dataset-agnostic, deterministic complaint discovery.
 *
 * The engine contains no product areas, brands, entities, or predefined pain
 * points. It discovers recurring problem expressions from the selected review
 * text, joins variants only when their evidence overlaps, and keeps the exact
 * supporting review IDs throughout the pipeline.
 */

type Token = { value: string; stem: string; index: number };

type Signal = {
  key: string;
  phrase: string;
  context: string | null;
  failure: string;
  severity: boolean;
};

type SignalGroup = {
  key: string;
  context: string | null;
  failure: string;
  reviewIds: Set<string>;
  phrases: Map<string, number>;
  severeIds: Set<string>;
};

type Cluster = {
  groups: SignalGroup[];
  reviewIds: Set<string>;
};

type Theme = {
  id: string;
  label: string;
  keywords: string[];
  problem: string;
  context: string | null;
  failure: string;
  coherence: number;
  severityShare: number;
  matched: Review[];
};

const WORDS = /[\p{L}\p{N}']+/gu;

// Function words and broad feedback vocabulary are linguistic filters, not
// product categories. Dataset-common tokens are also removed dynamically.
const STOPWORDS = new Set([
  "a","about","after","again","all","also","am","an","and","any","are","as","at","be","because","been","before","being","both","but","by","can","could","did","do","does","doing","during","each","even","ever","few","for","from","get","gets","getting","give","given","had","has","have","having","he","her","here","hers","herself","him","himself","his","how","i","if","in","into","is","it","its","itself","just","many","may","me","might","more","most","much","my","myself","no","nor","not","of","off","on","once","only","or","other","our","ours","out","over","own","same","she","should","so","some","such","than","that","the","their","theirs","them","themselves","then","there","these","they","this","those","through","to","too","under","until","up","us","very","was","we","were","what","when","where","which","while","who","why","will","with","would","you","your","yours",
]);

const BROAD_CONTEXT = new Set([
  "able","app","application","brand","business","company","customer","customers","experience","know","let","platform","product","products","service","services","system","thing","things","use","user","users","way","work",
]);

// Generic expressions of failure or friction. These identify complaint
// language; they do not define what the complaint is about.
const PROBLEM_STEMS = new Set([
  "annoy","awful","bad","block","broke","broken","cancel","confus","crash","delay","difficult","disappoint","error","expens","fail","fault","freez","frustrat","hard","hate","horribl","incorrect","issue","lag","late","lost","miss","poor","problem","refund","reject","ridicul","rude","scam","slow","spam","stuck","terribl","unaccept","unavail","unsafe","useless","waste","wrong","worst",
]);

const SEVERE_STEMS = new Set([
  "awful","crash","fail","fraud","horribl","scam","stuck","terribl","unaccept","unsafe","useless","waste","worst",
]);

const NEGATIONS = new Set([
  "can't","cannot","cant","couldn't","couldnt","doesn't","doesnt","don't","dont","never","no","not","unable","won't","wont","wouldn't","wouldnt",
]);

const INTENSIFIERS = new Set([
  "absolutely","always","constantly","extremely","frequently","really","repeatedly","seriously","totally",
]);

const CHURN_PATTERNS: { label: string; patterns: RegExp[] }[] = [
  {
    label: "Explicit intent to stop using the product",
    patterns: [
      /\b(?:stop|quit) (?:using|buying|ordering|paying)\b/i,
      /\b(?:won't|wont|will not|never) (?:use|buy|order|return)\b/i,
      /\b(?:uninstall|deleting|delete|deleted) (?:this |the )?(?:app|account)\b/i,
      /\b(?:done with|not coming back|no longer using|last time using)\b/i,
    ],
  },
  {
    label: "Switching to an alternative",
    patterns: [
      /\b(?:switching|switched|moving|moved|going) to (?:another|a different|an alternative|a competitor)\b/i,
      /\b(?:use|using) .{1,35} instead\b/i,
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
      /\b(?:every time|again and again|repeatedly|multiple times|third time)\b.{0,80}\b(?:fail|problem|issue|wrong|broken|unresolved|not fixed)\b/i,
      /\b(?:still not fixed|never gets resolved|keeps happening)\b/i,
    ],
  },
];

function thresholds(total: number) {
  const root = Math.sqrt(Math.max(total, 1));
  return {
    pain: Math.max(3, Math.min(120, Math.round(root * 0.42))),
    trend: Math.max(6, Math.min(180, Math.round(root * 0.55))),
    churn: Math.max(2, Math.min(80, Math.round(root * 0.18))),
  };
}

function stemWord(word: string): string {
  let value = word.toLowerCase().replace(/^'+|'+$/g, "");
  if (value.length > 6 && value.endsWith("ingly")) value = value.slice(0, -5);
  else if (value.length > 5 && value.endsWith("edly")) value = value.slice(0, -4);
  else if (value.length > 5 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith("ied")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s")) value = value.slice(0, -1);
  return value;
}

function words(text: string): string[] {
  return (text.toLowerCase().match(WORDS) ?? []).filter(Boolean);
}

function tokens(text: string): Token[] {
  return words(text).map((value, index) => ({ value, stem: stemWord(value), index }));
}

function isProblemToken(token: Token): boolean {
  return PROBLEM_STEMS.has(token.stem) || [...PROBLEM_STEMS].some((s) => token.stem.startsWith(s));
}

function hasProblemLanguage(text: string): boolean {
  const list = tokens(text);
  return list.some(isProblemToken) || list.some((t, i) => NEGATIONS.has(t.value) && !!list[i + 1]);
}

function isTextNegative(review: Review): boolean {
  return hasProblemLanguage(review.text);
}

function isComplaintReview(review: Review): boolean {
  return (review.rating !== null && review.rating <= 3) || isTextNegative(review);
}

function reviewNegativeShare(reviews: Review[]): { share: number; basis: "ratings" | "language"; rated: number } {
  const rated = reviews.filter((r): r is Review & { rating: number } => r.rating !== null);
  if (rated.length > 0) {
    return {
      share: rated.filter((r) => r.rating <= 2).length / rated.length,
      basis: "ratings",
      rated: rated.length,
    };
  }
  return {
    share: reviews.length ? reviews.filter(isTextNegative).length / reviews.length : 0,
    basis: "language",
    rated: 0,
  };
}

function documentFrequency(reviews: Review[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    const seen = new Set(words(review.text).map(stemWord).filter((w) => w.length > 2));
    for (const word of seen) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

function informative(token: Token, common: Set<string>): boolean {
  return (
    token.stem.length > 2 &&
    !STOPWORDS.has(token.value) &&
    !BROAD_CONTEXT.has(token.stem) &&
    !INTENSIFIERS.has(token.value) &&
    !NEGATIONS.has(token.value) &&
    !PROBLEM_STEMS.has(token.stem) &&
    !common.has(token.stem)
  );
}

function compactPhrase(sentenceTokens: Token[], start: number, end: number): string {
  return sentenceTokens
    .slice(start, end + 1)
    .map((t) => t.value)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSignals(review: Review, common: Set<string>): Signal[] {
  if (!isComplaintReview(review)) return [];
  const found = new Map<string, Signal>();
  const sentences = review.text.split(/[.!?;\n]+/).filter(Boolean).slice(0, 12);

  for (const sentence of sentences) {
    const list = tokens(sentence);
    for (let i = 0; i < list.length; i += 1) {
      const current = list[i];
      if (!current) continue;

      let failureIndex = i;
      let failure = current.stem;
      let cueStart = i;
      const negated = NEGATIONS.has(current.value) && !!list[i + 1];
      if (negated) {
        failureIndex = i + 1;
        failure = `not-${list[failureIndex]?.stem ?? "working"}`;
      } else if (!isProblemToken(current)) {
        continue;
      }

      const nearby = list
        .filter((token) => Math.abs(token.index - failureIndex) <= 5 && informative(token, common))
        .sort((a, b) => {
          const distance = Math.abs(a.index - failureIndex) - Math.abs(b.index - failureIndex);
          return distance !== 0 ? distance : a.index - b.index;
        });
      const contextToken = nearby[0] ?? null;
      // A complaint word without an object or context (for example “worst” or
      // “bad”) is sentiment, not a customer problem.
      if (!contextToken) continue;

      const context = contextToken?.stem ?? null;
      if (!context || context === failure || failure.startsWith(context) || context.startsWith(failure)) {
        continue;
      }
      const left = contextToken ? Math.min(contextToken.index, cueStart) : cueStart;
      const right = Math.max(contextToken?.index ?? failureIndex, failureIndex);
      const boundedLeft = Math.max(0, right - 6, left);
      const phrase = compactPhrase(list, boundedLeft, right);
      if (phrase.length < 3) continue;

      const key = `${context ?? "_"}|${failure}`;
      found.set(key, {
        key,
        phrase,
        context,
        failure,
        severity:
          SEVERE_STEMS.has((list[failureIndex] ?? current).stem) ||
          list.some((token) => INTENSIFIERS.has(token.value)),
      });
      if (negated) i = failureIndex;
      if (found.size >= 8) break;
    }
  }

  return [...found.values()];
}

function overlap(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  let shared = 0;
  for (const id of smaller) if (larger.has(id)) shared += 1;
  return smaller.size ? shared / smaller.size : 0;
}

function discoverThemes(reviews: Review[], minEvidence: number): Theme[] {
  if (reviews.length === 0) return [];
  const frequency = documentFrequency(reviews);
  // Remove near-universal corpus terms (often the uploaded product name), but
  // retain recurring problem objects that naturally occur in one large theme.
  const commonCutoff = Math.max(20, Math.round(reviews.length * 0.45));
  const common = new Set(
    [...frequency.entries()].filter(([, count]) => count >= commonCutoff).map(([term]) => term),
  );
  const groups = new Map<string, SignalGroup>();

  for (const review of reviews) {
    for (const signal of extractSignals(review, common)) {
      const existing = groups.get(signal.key);
      if (existing) {
        existing.reviewIds.add(review.id);
        existing.phrases.set(signal.phrase, (existing.phrases.get(signal.phrase) ?? 0) + 1);
        if (signal.severity) existing.severeIds.add(review.id);
      } else {
        groups.set(signal.key, {
          key: signal.key,
          context: signal.context,
          failure: signal.failure,
          reviewIds: new Set([review.id]),
          phrases: new Map([[signal.phrase, 1]]),
          severeIds: new Set(signal.severity ? [review.id] : []),
        });
      }
    }
  }

  const eligible = [...groups.values()]
    .filter((group) => group.reviewIds.size >= minEvidence)
    .sort((a, b) => b.reviewIds.size - a.reviewIds.size || a.key.localeCompare(b.key));

  const clusters: Cluster[] = [];
  for (const group of eligible) {
    const related = clusters.find((cluster) =>
      cluster.groups.some(
        (member) =>
          overlap(group.reviewIds, member.reviewIds) >= 0.58 &&
          (group.context === member.context || group.failure === member.failure),
      ),
    );
    if (related) {
      related.groups.push(group);
      for (const id of group.reviewIds) related.reviewIds.add(id);
    } else {
      clusters.push({ groups: [group], reviewIds: new Set(group.reviewIds) });
    }
  }

  const byId = new Map(reviews.map((review) => [review.id, review]));
  return clusters
    .filter((cluster) => cluster.reviewIds.size >= minEvidence)
    .map((cluster) => {
      const rankedGroups = [...cluster.groups].sort(
        (a, b) => b.reviewIds.size - a.reviewIds.size || a.key.localeCompare(b.key),
      );
      const lead = rankedGroups[0];
      if (!lead) return null;
      const phraseEntries = rankedGroups.flatMap((group) =>
        [...group.phrases.entries()].map(([phrase, count]) => ({ phrase, count, group })),
      );
      phraseEntries.sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
      const representative = phraseEntries[0]?.phrase ?? lead.failure.replace(/^not-/, "not ");
      const uniqueStems = new Set<string>();
      const labelWords = words(representative)
        .filter((word) => !STOPWORDS.has(word) && !BROAD_CONTEXT.has(stemWord(word)))
        .filter((word) => {
          const stem = stemWord(word);
          if (uniqueStems.has(stem)) return false;
          uniqueStems.add(stem);
          return true;
        })
        .slice(0, 5);
      const fallback = [lead.context, lead.failure.replace(/^not-/, "not ")].filter(Boolean).join(" ");
      const rawLabel = labelWords.length >= 2 ? labelWords.join(" ") : fallback || representative;
      const label = rawLabel.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
      const keywords = [...new Set(rankedGroups.flatMap((group) =>
        [...group.phrases.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 2)
          .map(([phrase]) => phrase),
      ))];
      const examples = keywords.slice(0, 3).map((phrase) => `“${phrase}”`).join(", ");
      const matched = [...cluster.reviewIds]
        .map((id) => byId.get(id))
        .filter((review): review is Review => !!review);
      const leadCoverage = lead.reviewIds.size / cluster.reviewIds.size;
      const severe = new Set(rankedGroups.flatMap((group) => [...group.severeIds]));

      return {
        id: stableId(rankedGroups.map((group) => group.key).sort().join("|")),
        label,
        keywords,
        problem: `Across ${matched.length.toLocaleString()} supporting reviews, customers repeatedly describe ${examples || `“${rawLabel}”`}. This cluster is based on recurring complaint expressions and their shared review evidence.`,
        context: lead.context,
        failure: lead.failure,
        coherence: leadCoverage,
        severityShare: matched.length ? severe.size / matched.length : 0,
        matched,
      } satisfies Theme;
    })
    .filter((theme): theme is Theme => theme !== null)
    .sort((a, b) => b.matched.length - a.matched.length || a.label.localeCompare(b.label))
    .filter((theme, index, all) => {
      const normalized = theme.label.toLowerCase();
      return all.findIndex((candidate) => candidate.label.toLowerCase() === normalized) === index;
    })
    .slice(0, 18);
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function buildInsight(id: string, label: string, reviews: Review[]): Insight | null {
  if (reviews.length === 0) return null;
  const rated = reviews.filter((r): r is Review & { rating: number } => r.rating !== null);
  const negativity = reviewNegativeShare(reviews);
  return {
    id,
    label,
    reviewIds: reviews.map((review) => review.id),
    negativeShare: negativity.share,
    avgRating: rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null,
  };
}

/** Verbatim excerpt around the discovered complaint wording. */
function excerpt(review: Review, phrases: string[]): Excerpt {
  const text = review.text.trim();
  const lower = text.toLowerCase();
  const phrase = phrases.find((candidate) => lower.includes(candidate.toLowerCase()));
  let snippet = text;
  if (text.length > 220 && phrase) {
    const at = lower.indexOf(phrase.toLowerCase());
    const start = Math.max(0, at - 90);
    const end = Math.min(text.length, at + phrase.length + 130);
    snippet = `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  } else if (text.length > 220) {
    snippet = `${text.slice(0, 220).trim()}…`;
  }
  return { reviewId: review.id, text: snippet, date: review.date };
}

type TimeContext = {
  split: number;
  from: number;
  to: number;
  earlierReviews: number;
  recentReviews: number;
};

function buildTimeContext(reviews: Review[]): TimeContext | null {
  const dated = reviews
    .map((review) => ({ review, time: review.date ? Date.parse(review.date) : NaN }))
    .filter((item) => !Number.isNaN(item.time));
  if (dated.length === 0) return null;
  const from = Math.min(...dated.map((item) => item.time));
  const to = Math.max(...dated.map((item) => item.time));
  if (from === to) return null;
  const split = from + (to - from) / 2;
  return {
    split,
    from,
    to,
    earlierReviews: dated.filter((item) => item.time < split).length,
    recentReviews: dated.filter((item) => item.time >= split).length,
  };
}

function monthKey(time: number): string {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildTrend(matched: Review[], time: TimeContext | null, minEvidence: number): TrendEvidence {
  const dated = matched
    .map((review) => (review.date ? Date.parse(review.date) : NaN))
    .filter((value) => !Number.isNaN(value));
  if (!time || dated.length < minEvidence || time.earlierReviews === 0 || time.recentReviews === 0) {
    return { evidence: false };
  }

  const earlier = dated.filter((value) => value < time.split).length;
  const recent = dated.length - earlier;
  const earlierRate = earlier / time.earlierReviews;
  const recentRate = recent / time.recentReviews;
  const changePct = earlierRate > 0 ? ((recentRate - earlierRate) / earlierRate) * 100 : null;
  const buckets = new Map<string, number>();
  for (const value of dated) {
    const key = monthKey(value);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const months: MonthPoint[] = [...buckets.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  return {
    evidence: true,
    earlier,
    recent,
    changePct,
    direction: changePct === null || changePct > 10 ? "rising" : changePct < -10 ? "falling" : "steady",
    months,
    window: {
      from: new Date(time.from).toISOString().slice(0, 10),
      to: new Date(time.to).toISOString().slice(0, 10),
    },
  };
}

function buildConfidence(
  mentionCount: number,
  total: number,
  minEvidence: number,
  coherence: number,
  ratedCount: number,
): Confidence {
  const strength = mentionCount / Math.max(minEvidence, 1);
  const ratingCoverage = mentionCount ? ratedCount / mentionCount : 0;
  const level: Confidence["level"] =
    strength >= 3 && coherence >= 0.7
      ? "High"
      : strength >= 1.5 && coherence >= 0.55
        ? "Moderate"
        : "Low";
  return {
    level,
    basis: `${mentionCount.toLocaleString()} linked reviews (${total ? ((mentionCount / total) * 100).toFixed(1) : "0.0"}% of the dataset); ${(coherence * 100).toFixed(0)}% share the dominant complaint pattern; ${ratedCount.toLocaleString()} carry ratings (${(ratingCoverage * 100).toFixed(0)}%).`,
  };
}

function churnEvidence(matched: Review[], minEvidence: number): ChurnEvidence {
  const labelsById = new Map<string, string[]>();
  for (const review of matched) {
    for (const rule of CHURN_PATTERNS) {
      if (rule.patterns.some((pattern) => pattern.test(review.text))) {
        const labels = labelsById.get(review.id) ?? [];
        labels.push(rule.label);
        labelsById.set(review.id, labels);
      }
    }
  }
  const reviewIds = [...labelsById.keys()];
  if (reviewIds.length < minEvidence) return { evidence: false };
  return {
    evidence: true,
    reviewIds,
    share: matched.length ? reviewIds.length / matched.length : 0,
    signals: [...new Set([...labelsById.values()].flat())].slice(0, 3),
  };
}

function buildOpportunity(theme: Theme, insight: Insight, excerpts: Excerpt[]): OpportunityEvidence {
  const context = theme.context?.replace(/-/g, " ") ?? null;
  const failure = theme.failure.replace(/^not-/, "not ").replace(/-/g, " ");
  if (!context || context === failure || theme.coherence < 0.45) return { evidence: false };
  const evidencePhrase = theme.keywords[0];
  if (!evidencePhrase || words(evidencePhrase).length < 2) return { evidence: false };

  const phrase = evidencePhrase.replace(/[“”]/g, "");
  const failure = theme.failure.replace(/^not-/, "not ");
  const statement =
    /slow|delay|late|lag|stuck|freez/.test(failure)
      ? `Test ways to make ${context} faster and more predictable, with progress or delay visibility when the recurring “${phrase}” condition occurs.`
      : /fail|error|broke|broken|crash|reject|not/.test(failure)
        ? `Test safeguards and a clear recovery path for the recurring “${phrase}” failure in ${context}.`
        : /wrong|incorrect|miss|lost/.test(failure)
          ? `Test validation and correction steps that prevent or quickly resolve the recurring “${phrase}” problem.`
          : /confus|hard|difficult/.test(failure)
            ? `Test clearer guidance and decision support around ${context} where reviews repeatedly describe “${phrase}”.`
            : /expens|refund|waste/.test(failure)
              ? `Test clearer cost visibility, controls, and recovery around ${context} for reviews describing “${phrase}”.`
              : /cancel/.test(failure)
                ? `Investigate why “${phrase}” recurs and test prevention plus recovery steps around ${context}.`
                : `Test a targeted prevention and recovery intervention for the recurring “${phrase}” problem around ${context}.`;

  return {
    evidence: true,
    statement,
    reviewIds: insight.reviewIds,
    excerpts: excerpts.slice(0, 3),
  };
}

export function analyze(reviews: Review[]): Analysis {
  const total = reviews.length;
  const limits = thresholds(total);
  const time = buildTimeContext(reviews);
  const themes = discoverThemes(reviews, limits.pain);
  const maxMentions = Math.max(...themes.map((theme) => theme.matched.length), 1);

  const unranked = themes.map((theme) => {
    const insight = buildInsight(`theme-${theme.id}`, theme.label, theme.matched);
    if (!insight) return null;
    const datedCount = theme.matched.filter((review) => review.date !== null).length;
    const ratedCount = theme.matched.filter((review) => review.rating !== null).length;
    const trend = buildTrend(theme.matched, time, limits.trend);
    const churn = churnEvidence(theme.matched, limits.churn);
    const negativeReviews = [...theme.matched]
      .filter(isComplaintReview)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const excerptSource = negativeReviews.length ? negativeReviews : theme.matched;
    const excerpts = excerptSource.slice(0, 4).map((review) => excerpt(review, theme.keywords));
    const confidence = buildConfidence(
      insight.reviewIds.length,
      total,
      limits.pain,
      theme.coherence,
      ratedCount,
    );

    const volumeFactor = Math.log1p(insight.reviewIds.length) / Math.log1p(maxMentions);
    const negativeFactor = insight.negativeShare;
    const trendFactor = trend.evidence && trend.changePct !== null
      ? Math.max(0, Math.min(1, trend.changePct / 100))
      : 0;
    const qualityFactor = Math.min(1, theme.coherence);
    const severityFactor = Math.min(1, theme.severityShare);
    const score = Math.round(
      (volumeFactor * 0.35 +
        negativeFactor * 0.25 +
        trendFactor * 0.15 +
        qualityFactor * 0.15 +
        severityFactor * 0.1) *
        100,
    );
    const opportunity = buildOpportunity(theme, insight, excerpts);

    return {
      theme,
      insight,
      datedCount,
      trend,
      churn,
      excerpts,
      confidence,
      score,
      factors: { volumeFactor, negativeFactor, trendFactor, qualityFactor, severityFactor },
      opportunity,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  unranked.sort((a, b) => b.score - a.score || b.insight.reviewIds.length - a.insight.reviewIds.length);

  const painPoints: PainPoint[] = unranked.map((item, index) => ({
    ...item.insight,
    description: item.theme.problem,
    keywords: item.theme.keywords,
    mentionCount: item.insight.reviewIds.length,
    datasetShare: total ? item.insight.reviewIds.length / total : 0,
    excerpts: item.excerpts,
    trend: item.trend,
    confidence: item.confidence,
    churn: item.churn,
    priority: {
      score: item.score,
      rank: index + 1,
      impact: item.score >= 70 ? "High" : item.score >= 45 ? "Medium" : "Low",
      rationale: `Evidence factors: volume ${Math.round(item.factors.volumeFactor * 100)}/100, negative rating share ${Math.round(item.factors.negativeFactor * 100)}/100, comparable-period trend ${Math.round(item.factors.trendFactor * 100)}/100, cluster consistency ${Math.round(item.factors.qualityFactor * 100)}/100, and severity evidence ${Math.round(item.factors.severityFactor * 100)}/100.`,
    },
    opportunity: item.opportunity,
  }));

  const trends = painPoints
    .filter((pain) => pain.trend.evidence)
    .map((pain) => {
      if (!pain.trend.evidence) return null;
      return {
        id: `trend-${pain.id}`,
        label: pain.label,
        reviewIds: pain.reviewIds,
        negativeShare: pain.negativeShare,
        avgRating: pain.avgRating,
        recent: pain.trend.recent,
        earlier: pain.trend.earlier,
        changePct: pain.trend.changePct,
      };
    })
    .filter((trend): trend is NonNullable<typeof trend> => trend !== null)
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));

  const churnSignals = CHURN_PATTERNS.map((rule, index) => {
    const matched = reviews.filter((review) => rule.patterns.some((pattern) => pattern.test(review.text)));
    return buildInsight(`churn-${index}`, rule.label, matched);
  })
    .filter((insight): insight is Insight => !!insight && insight.reviewIds.length >= limits.churn)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  const priorities: PriorityItem[] = painPoints.slice(0, 5).map((pain) => ({
    ...pain,
    id: `prio-${pain.id}`,
    score: pain.priority.score,
    impact: pain.priority.impact,
  }));

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
  const dated = reviews
    .map((review) => (review.date ? Date.parse(review.date) : NaN))
    .filter((value) => !Number.isNaN(value));
  const overallNegative = reviewNegativeShare(reviews);

  return {
    kpis: {
      reviewCount: total,
      ratedCount: rated.length,
      avgRating: rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null,
      negativeShare: total ? overallNegative.share : null,
      themeCount: painPoints.length,
      dateRange: dated.length
        ? {
            from: new Date(Math.min(...dated)).toISOString().slice(0, 10),
            to: new Date(Math.max(...dated)).toISOString().slice(0, 10),
          }
        : null,
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
  for (const group of groups) {
    for (const insight of group.items) {
      for (const id of insight.reviewIds) {
        const existing = index.get(id);
        if (!existing) {
          index.set(id, [{ kind: group.kind, items: [insight] }]);
          continue;
        }
        const matching = existing.find((entry) => entry.kind === group.kind);
        if (matching) matching.items.push(insight);
        else existing.push({ kind: group.kind, items: [insight] });
      }
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