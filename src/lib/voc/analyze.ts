import type {
  Analysis,
  ChurnEvidence,
  Confidence,
  Excerpt,
  Insight,
  MonthPoint,
  OpportunityEvidence,
  PainPoint,
  PriorityItem,
  Review,
  TrendEvidence,
} from "./types";

/**
 * Themes come from two places, both grounded in the connected review text:
 *
 * 1. Discovery — recurring words/phrases mined from the negative reviews of the
 *    dataset that is actually loaded. This is what makes the engine work on any
 *    uploaded file, with no domain assumptions.
 * 2. An optional generic lexicon of common product-feedback themes, kept only
 *    when the loaded reviews actually contain that wording.
 *
 * A theme with too few matched reviews for the size of the dataset never
 * appears, and every derived field is computed from matched reviews or reported
 * as insufficient evidence.
 */
type Theme = {
  label: string;
  keywords: string[];
  /** Neutral description of the problem the matched wording describes. */
  problem: string;
  /** Statement of the opportunity, derived from the problem the theme describes. */
  opportunity: string;
};

const LEXICON_THEMES: Theme[] = [

  {
    label: "Delivery speed & reliability",
    keywords: ["late", "delay", "delayed", "slow delivery", "took an hour", "waiting", "eta", "on time", "never arrived", "delivery time"],
    problem: "Reviews describe orders arriving later than promised, long waits, or deliveries that never arrived.",
    opportunity: "Tighten delivery-time promises and proactively communicate delays for the orders these reviews describe.",
  },
  {
    label: "Food quality & freshness",
    keywords: ["cold", "stale", "quality", "tasteless", "spoiled", "soggy", "fresh", "burnt", "raw"],
    problem: "Reviews report food arriving cold, stale, soggy or otherwise below expected quality.",
    opportunity: "Add quality safeguards and food-condition checks targeting the problems these reviews describe.",
  },
  {
    label: "Order accuracy & missing items",
    keywords: ["missing", "wrong order", "wrong item", "incomplete", "not delivered", "different item"],
    problem: "Reviews describe missing items, wrong items, or incomplete orders.",
    opportunity: "Introduce order verification and fast missing-item resolution for the failures these reviews describe.",
  },
  {
    label: "Packaging & spillage",
    keywords: ["packaging", "spilled", "leaked", "leaking", "crushed", "container"],
    problem: "Reviews report leaking, spilled or crushed packaging on arrival.",
    opportunity: "Set packaging standards for the spill-prone items these reviews describe.",
  },
  {
    label: "Pricing, charges & coupons",
    keywords: ["expensive", "price", "pricing", "charges", "surge", "coupon", "offer", "discount", "overcharged", "delivery fee"],
    problem: "Reviews question prices, added charges, or coupons and offers not applying as expected.",
    opportunity: "Make charges and coupon rules explicit at checkout to address the confusion these reviews describe.",
  },
  {
    label: "Refunds & payments",
    keywords: ["refund", "payment", "wallet", "money not", "deducted", "transaction", "failed payment", "cashback"],
    problem: "Reviews describe failed payments, deducted money, or refunds not received.",
    opportunity: "Give refund status visibility and self-serve payment recovery for the failures these reviews describe.",
  },
  {
    label: "Customer support",
    keywords: ["support", "customer care", "no response", "chatbot", "agent", "helpline", "complaint"],
    problem: "Reviews describe unresponsive or unhelpful support and unresolved complaints.",
    opportunity: "Offer faster escalation to a human for the unresolved complaints these reviews describe.",
  },
  {
    label: "App performance & stability",
    keywords: ["crash", "crashes", "bug", "hangs", "freeze", "lag", "slow app", "not loading", "login issue"],
    problem: "Reviews report crashes, freezes, slowness or sign-in failures in the app.",
    opportunity: "Prioritise stability work on the flows these reviews describe failing.",
  },
  {
    label: "Search & discovery",
    keywords: ["search", "filter", "find restaurant", "recommendation", "browse", "sort"],
    problem: "Reviews describe difficulty finding restaurants or dishes through search, filters or sorting.",
    opportunity: "Extend filters and sorting to address the discovery difficulty these reviews describe.",
  },
  {
    label: "Delivery partner experience",
    keywords: ["delivery partner", "rider", "driver", "delivery boy", "rude", "behaviour", "behavior"],
    problem: "Reviews describe negative interactions or conduct issues with delivery partners.",
    opportunity: "Add delivery-partner conduct feedback and follow-up for the incidents these reviews describe.",
  },
  {
    label: "Order tracking",
    keywords: ["tracking", "track order", "live location", "map", "status"],
    problem: "Reviews describe inaccurate, stalled or missing order tracking and status updates.",
    opportunity: "Improve live tracking accuracy and status detail for the gaps these reviews describe.",
  },
];

/**
 * Churn wording is deliberately product-agnostic: it looks for the customer
 * stating they will stop, cancel, or move elsewhere, or expressing severe
 * repeated dissatisfaction. No competitor or vertical is assumed.
 */
const CHURN_RULES: { label: string; keywords: string[] }[] = [
  { label: "Explicit intent to stop using the product", keywords: ["uninstall", "deleting the app", "delete the app", "deleted the app", "never again", "never order", "never buy", "never use", "last time", "stop using", "won't use", "will not use", "not coming back", "done with", "no longer use"] },
  { label: "Switching to an alternative", keywords: ["switch", "switching", "switched", "competitor", "better app", "better alternative", "moved to", "moving to", "going elsewhere", "somewhere else", "instead of"] },
  { label: "Long-tenure customer expressing decline", keywords: ["used to be", "loyal", "gone downhill", "getting worse", "declined", "not what it used to", "years of using"] },
  { label: "Cancellation & refund escalation", keywords: ["cancel", "cancelled", "canceled", "cancelling", "unsubscribe", "refund not", "no refund", "chargeback", "want my money back"] },
  { label: "Severe repeated dissatisfaction", keywords: ["every time", "again and again", "repeatedly", "still not fixed", "third time", "multiple times", "worst experience", "waste of money"] },
];

const OPPORTUNITY_KEYWORDS = [
  "wish", "should add", "please add", "would be great", "hope you", "suggest", "feature request",
  "would love", "needs an option", "add an option", "allow us", "why can't", "why cant",
  "should have", "please fix", "needs to", "it would help", "request you",
];

const NEGATIVE_WORDS = [
  "bad", "worst", "terrible", "awful", "poor", "horrible", "disappointed", "disappointing",
  "hate", "useless", "never", "problem", "issue", "annoying", "frustrating", "pathetic", "waste",
  "broken", "unacceptable", "rude", "slow", "failed", "error", "complaint", "unhappy",
];

/**
 * Evidence thresholds scale with the size of the connected dataset, so a
 * 1,000-review file is analysed the same way a 100,000-review file is.
 */
function thresholds(total: number) {
  const share = (pct: number, floor: number) =>
    Math.max(floor, Math.round((total * pct) / 100));
  return {
    pain: Math.min(share(0.5, 3), 200),
    trend: Math.min(share(0.6, 6), 300),
    opportunity: Math.min(share(0.2, 2), 100),
    churn: Math.min(share(0.2, 2), 100),
  };
}

/** Set once per analyze() call from the dataset size. */
let MIN_PAIN_EVIDENCE = 3;
let MIN_TREND_EVIDENCE = 6;
let MIN_CHURN_EVIDENCE = 2;

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","than","that","this","these","those","is","are","was","were","be","been","being","am","do","does","did","doing","have","has","had","having","i","me","my","we","our","you","your","he","she","it","its","they","them","their","of","in","on","at","to","for","with","from","by","as","about","into","over","after","before","up","down","out","off","again","very","so","just","too","also","not","no","nor","only","own","same","such","can","cant","will","would","should","could","may","might","must","there","here","when","where","why","how","what","which","who","whom","all","any","both","each","few","more","most","other","some","one","two","get","got","get","really","much","many","because","while","during","still","even","ever","never","always","use","used","using","app","order","orders","ordered","time","times","good","great","nice","best","like","love","thank","thanks","please","dont","doesnt","didnt","im","ive","was","were","us","he's","made","make","went","give","given","take","taken","now","back","first","last","next","don","t","s","re","ll","ve","m","d",
]);

/** Reviews scanned when mining recurring wording (deterministic prefix). */
const DISCOVERY_SAMPLE = 20000;
/** Maximum discovered themes kept. */
const MAX_DISCOVERED = 12;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && w.length < 24 && !STOPWORDS.has(w));
}

/**
 * Mine recurring words and phrases from the negative reviews of the connected
 * dataset. Each surviving term becomes a theme whose evidence is, by
 * construction, the reviews that literally contain that term.
 */
function discoverThemes(reviews: Review[], minCount: number, taken: Set<string>): Theme[] {
  const sample = reviews.length > DISCOVERY_SAMPLE ? reviews.slice(0, DISCOVERY_SAMPLE) : reviews;
  const negDf = new Map<string, number>();
  const allDf = new Map<string, number>();
  let negTotal = 0;

  for (const r of sample) {
    const negative = isNegative(r);
    if (negative) negTotal += 1;
    const words = tokenize(r.text);
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      seen.add(words[i]!);
      if (i + 1 < words.length) seen.add(`${words[i]} ${words[i + 1]}`);
    }
    for (const term of seen) {
      allDf.set(term, (allDf.get(term) ?? 0) + 1);
      if (negative) negDf.set(term, (negDf.get(term) ?? 0) + 1);
    }
  }

  const scale = sample.length ? reviews.length / sample.length : 1;
  const scaled = (n: number) => n * scale;

  const candidates = [...negDf.entries()]
    .filter(([term, n]) => {
      if (scaled(n) < minCount) return false;
      const all = allDf.get(term) ?? n;
      // The term must be negative-leaning within this dataset.
      return n / all >= 0.5;
    })
    // Prefer phrases, then frequency: phrases describe problems more precisely.
    .sort((a, b) => {
      const phrase = (t: string) => (t.includes(" ") ? 1 : 0);
      const d = phrase(b[0]) - phrase(a[0]);
      return d !== 0 ? d : b[1] - a[1];
    });

  const kept: Theme[] = [];
  const keptTerms: string[] = [];
  for (const [term, n] of candidates) {
    if (taken.has(term)) continue;
    if (keptTerms.some((k) => k.includes(term) || term.includes(k))) continue;
    keptTerms.push(term);
    const negShare = negTotal ? n / negTotal : 0;
    kept.push({
      label: term.replace(/\b\w/g, (c) => c.toUpperCase()),
      keywords: [term],
      problem: `Recurring wording in the connected reviews: “${term}” appears in ${Math.round(scaled(n)).toLocaleString()} reviews that read as negative (${(negShare * 100).toFixed(1)}% of the negative reviews sampled).`,
      opportunity: `Address what reviewers describe around “${term}” in the connected reviews.`,
    });
    if (kept.length >= MAX_DISCOVERED) break;
  }
  return kept;
}


const norm = (s: string) => s.toLowerCase();

/** Lowercased verbatim text, cached so large datasets are only normalized once. */
const lowerCache = new WeakMap<Review, string>();
function low(r: Review): string {
  let t = lowerCache.get(r);
  if (t === undefined) {
    t = norm(r.text);
    lowerCache.set(r, t);
  }
  return t;
}

function isNegative(r: Review): boolean {
  if (r.rating !== null) return r.rating <= 3;
  const t = low(r);
  return NEGATIVE_WORDS.some((w) => t.includes(w));
}

function firstMatchedKeyword(r: Review, keywords: string[]): string | null {
  const t = low(r);
  for (const k of keywords) if (t.includes(k)) return k;
  return null;
}

function buildInsight(id: string, label: string, reviews: Review[]): Insight | null {
  if (reviews.length === 0) return null;
  const rated = reviews.filter((r) => r.rating !== null) as (Review & { rating: number })[];
  return {
    id,
    label,
    reviewIds: reviews.map((r) => r.id),
    negativeShare: reviews.filter(isNegative).length / reviews.length,
    avgRating: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null,
  };
}

function median(dates: number[]): number | null {
  if (dates.length === 0) return null;
  const s = [...dates].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? null;
}

/** Verbatim excerpt around the matched wording — text is never rewritten. */
function excerpt(r: Review, keywords: string[]): Excerpt {
  const keyword = firstMatchedKeyword(r, keywords);
  const text = r.text.trim();
  let snippet = text;
  if (text.length > 220 && keyword) {
    const at = low(r).indexOf(keyword);
    const start = Math.max(0, at - 90);
    const end = Math.min(text.length, at + keyword.length + 130);
    snippet = `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  } else if (text.length > 220) {
    snippet = `${text.slice(0, 220).trim()}…`;
  }
  return { reviewId: r.id, text: snippet, date: r.date };
}

function monthKey(t: number) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildTrend(matched: Review[], split: number | null): TrendEvidence {
  const times = matched
    .map((r) => (r.date ? Date.parse(r.date) : NaN))
    .filter((n) => !Number.isNaN(n));
  if (split === null || times.length < MIN_TREND_EVIDENCE) return { evidence: false };

  let recent = 0;
  let earlier = 0;
  const buckets = new Map<string, number>();
  for (const t of times) {
    if (t >= split) recent += 1;
    else earlier += 1;
    const k = monthKey(t);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  if (recent === 0 && earlier === 0) return { evidence: false };

  const months: MonthPoint[] = [...buckets.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
  const changePct = earlier > 0 ? ((recent - earlier) / earlier) * 100 : null;
  const direction =
    changePct === null || changePct > 10 ? "rising" : changePct < -10 ? "falling" : "steady";

  return {
    evidence: true,
    recent,
    earlier,
    changePct,
    direction,
    months,
    window: {
      from: new Date(Math.min(...times)).toISOString().slice(0, 10),
      to: new Date(Math.max(...times)).toISOString().slice(0, 10),
    },
  };
}

/** Confidence scales with the size of the connected dataset, never a fixed rule. */
function buildConfidence(mentionCount: number, datedCount: number, total: number): Confidence {
  const share = total ? mentionCount / total : 0;
  const strong = Math.max(30, Math.round(total * 0.02));
  const moderate = Math.max(10, Math.round(total * 0.008));
  const level: Confidence["level"] =
    mentionCount >= strong && datedCount >= mentionCount * 0.5
      ? "High"
      : mentionCount >= moderate
        ? "Moderate"
        : "Low";
  return {
    level,
    basis: `${mentionCount.toLocaleString()} matched reviews (${(share * 100).toFixed(1)}% of ${total.toLocaleString()}), ${datedCount.toLocaleString()} with dates`,
  };
}

export function analyze(reviews: Review[]): Analysis {
  const total = reviews.length;
  const limits = thresholds(total);
  MIN_PAIN_EVIDENCE = limits.pain;
  MIN_TREND_EVIDENCE = limits.trend;
  MIN_CHURN_EVIDENCE = limits.churn;

  const rated = reviews.filter((r) => r.rating !== null) as (Review & { rating: number })[];
  const times = reviews
    .map((r) => (r.date ? Date.parse(r.date) : NaN))
    .filter((n) => !Number.isNaN(n));
  const split = median(times);

  // Themes: generic lexicon wording present in this file, plus wording mined
  // from this file's own negative reviews.
  const lexiconTerms = new Set(LEXICON_THEMES.flatMap((t) => t.keywords));
  const THEMES: Theme[] = [
    ...LEXICON_THEMES,
    ...discoverThemes(reviews, MIN_PAIN_EVIDENCE, lexiconTerms),
  ];

  // Single pass over the dataset: theme, churn and request membership.
  const themeMatched: Review[][] = THEMES.map(() => []);
  const churnMatched: Review[][] = CHURN_RULES.map(() => []);
  const churnSet = new Set<string>();
  const churnLabelsByReview = new Map<string, string[]>();
  const requestSet = new Set<string>();

  for (const r of reviews) {
    const t = low(r);
    const negative = isNegative(r);
    THEMES.forEach((theme, i) => {
      if (theme.keywords.some((k) => t.includes(k))) themeMatched[i]!.push(r);
    });
    CHURN_RULES.forEach((rule, i) => {
      if (negative && rule.keywords.some((k) => t.includes(k))) {
        churnMatched[i]!.push(r);
        churnSet.add(r.id);
        const list = churnLabelsByReview.get(r.id);
        if (list) list.push(rule.label);
        else churnLabelsByReview.set(r.id, [rule.label]);
      }
    });
    if (OPPORTUNITY_KEYWORDS.some((k) => t.includes(k))) {
      requestSet.add(r.id);
    }
  }

  const themeInsights = THEMES.map((theme, i) => ({
    theme,
    matched: themeMatched[i]!,
    insight: buildInsight(`theme-${i}`, theme.label, themeMatched[i]!),
  })).filter((x) => x.insight !== null) as {
    theme: Theme;
    matched: Review[];
    insight: Insight;
  }[];


  // Legacy insight collections kept for the trend / churn / opportunity sections.
  const trends = themeInsights
    .map(({ matched, insight }) => {
      const t = buildTrend(matched, split);
      return t.evidence
        ? { ...insight, recent: t.recent, earlier: t.earlier, changePct: t.changePct }
        : null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));

  const churnSignals = CHURN_RULES.map((rule, i) =>
    buildInsight(`churn-${i}`, rule.label, churnMatched[i]!),
  )
    .filter((i): i is Insight => i !== null && i.reviewIds.length >= MIN_CHURN_EVIDENCE)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  // Opportunities are derived from the pain points below (see `opportunities`).


  // Pain points: negative-dominant themes with enough evidence to report.
  const candidates = themeInsights
    .filter(({ insight }) => insight.negativeShare >= 0.5 && insight.reviewIds.length >= MIN_PAIN_EVIDENCE)
    .sort((a, b) => b.insight.reviewIds.length - a.insight.reviewIds.length);

  const maxMentions = candidates[0]?.insight.reviewIds.length ?? 0;

  const scored = candidates.map(({ theme, matched, insight }) => {
    const reach = maxMentions ? insight.reviewIds.length / maxMentions : 0;
    const churnIds = insight.reviewIds.filter((id) => churnSet.has(id));
    const churnShare = churnIds.length / insight.reviewIds.length;
    const score = Math.round((reach * 0.55 + insight.negativeShare * 0.3 + churnShare * 0.15) * 100);
    return { theme, matched, insight, churnIds, churnShare, score };
  });

  const painPoints: PainPoint[] = [...scored]
    .sort((a, b) => b.score - a.score)
    .map((c, index) => {
      const { theme, matched, insight, churnIds, churnShare, score } = c;
      const datedCount = matched.filter((r) => r.date !== null).length;
      const trend = buildTrend(matched, split);

      const negativeMatched = matched.filter(isNegative);
      const excerptSource = (negativeMatched.length ? negativeMatched : matched).slice(0, 400);
      const excerpts = excerptSource
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, 4)
        .map((r) => excerpt(r, theme.keywords));

      const churn: ChurnEvidence =
        churnIds.length >= MIN_CHURN_EVIDENCE
          ? {
              evidence: true,
              reviewIds: churnIds,
              share: churnShare,
              signals: [
                ...new Set(churnIds.flatMap((id) => churnLabelsByReview.get(id) ?? [])),
              ].slice(0, 3),
            }
          : { evidence: false };

      // Opportunities follow from the pain point itself: any pain point with
      // enough evidence to report also has enough evidence for a potential,
      // validation-pending opportunity. Reviews that explicitly ask for
      // something are preferred as excerpts when they exist, but not required.
      const requested = matched.filter((r) => requestSet.has(r.id));
      const oppExcerptSource = requested.length ? requested : excerptSource;
      const opportunity: OpportunityEvidence = {
        evidence: true,
        statement: theme.opportunity,
        reviewIds: insight.reviewIds,
        excerpts: oppExcerptSource
          .slice(0, 3)
          .map((r) => excerpt(r, requested.length ? OPPORTUNITY_KEYWORDS : theme.keywords)),
      };


      return {
        ...insight,
        description: theme.problem,
        keywords: theme.keywords,
        mentionCount: insight.reviewIds.length,

        datasetShare: total ? insight.reviewIds.length / total : 0,
        excerpts,
        trend,
        confidence: buildConfidence(insight.reviewIds.length, datedCount, total),
        churn,
        priority: {
          score,
          rank: index + 1,
          impact: score >= 70 ? "High" : score >= 40 ? "Medium" : "Low",
          rationale: `Ranked from reach (${insight.reviewIds.length.toLocaleString()} mentions), negative share (${Math.round(insight.negativeShare * 100)}%) and churn-language overlap (${Math.round(churnShare * 100)}%) in the connected reviews.`,
        },
        opportunity,
      } satisfies PainPoint;
    });

  const priorities: PriorityItem[] = painPoints.slice(0, 5).map((p) => ({
    ...p,
    id: `prio-${p.id}`,
    score: p.priority.score,
    impact: p.priority.impact,
  }));

  // One potential opportunity per sufficiently evidenced pain point, linked to
  // that pain point's own supporting review IDs.
  const opportunities: Insight[] = painPoints
    .filter((p) => p.opportunity.evidence)
    .map((p) => ({
      id: `opp-${p.id}`,
      label: p.label,
      reviewIds: p.reviewIds,
      negativeShare: p.negativeShare,
      avgRating: p.avgRating,
    }))
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);


  return {
    kpis: {
      reviewCount: total,
      ratedCount: rated.length,
      avgRating: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null,
      negativeShare: total ? reviews.filter(isNegative).length / total : null,
      themeCount: themeInsights.length,
      dateRange: times.length
        ? {
            from: new Date(Math.min(...times)).toISOString().slice(0, 10),
            to: new Date(Math.max(...times)).toISOString().slice(0, 10),
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

/** reviewId -> supporting insights, built once per Analysis. */
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
  for (const g of groups) {
    for (const insight of g.items) {
      for (const id of insight.reviewIds) {
        const existing = index.get(id);
        if (!existing) {
          index.set(id, [{ kind: g.kind, items: [insight] }]);
          continue;
        }
        const group = existing.find((e) => e.kind === g.kind);
        if (group) group.items.push(insight);
        else existing.push({ kind: g.kind, items: [insight] });
      }
    }
  }
  evidenceIndex.set(analysis, index);
  return index;
}

/** Every insight (of any kind) that a given review is evidence for. */
export function insightsForReview(analysis: Analysis, reviewId: string): Group[] {
  return buildIndex(analysis).get(reviewId) ?? [];
}

/** Count of supporting insights, cheap for long feeds. */
export function insightCountForReview(analysis: Analysis, reviewId: string): number {
  return insightsForReview(analysis, reviewId).reduce((n, g) => n + g.items.length, 0);
}
