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
 * Theme lexicon. Insights are derived ONLY by matching these keywords against
 * the verbatim review text of the connected dataset. Nothing is invented:
 * a theme with zero matched reviews never appears, and every derived field is
 * either computed from matched reviews or reported as insufficient evidence.
 */
const THEMES: {
  label: string;
  keywords: string[];
  /** Neutral description of the problem the matched wording describes. */
  problem: string;
  /** Statement of the opportunity, only ever shown with supporting requests. */
  opportunity: string;
}[] = [
  {
    label: "Delivery speed & reliability",
    keywords: ["late", "delay", "delayed", "slow delivery", "took an hour", "waiting", "eta", "on time", "never arrived", "delivery time"],
    problem: "Reviews describe orders arriving later than promised, long waits, or deliveries that never arrived.",
    opportunity: "Tighten delivery-time promises and communicate delays proactively where reviewers ask for it.",
  },
  {
    label: "Food quality & freshness",
    keywords: ["cold", "stale", "quality", "tasteless", "spoiled", "soggy", "fresh", "burnt", "raw"],
    problem: "Reviews report food arriving cold, stale, soggy or otherwise below expected quality.",
    opportunity: "Add quality safeguards and food-condition feedback where reviewers explicitly request it.",
  },
  {
    label: "Order accuracy & missing items",
    keywords: ["missing", "wrong order", "wrong item", "incomplete", "not delivered", "different item"],
    problem: "Reviews describe missing items, wrong items, or incomplete orders.",
    opportunity: "Introduce order-verification and fast missing-item resolution asked for in reviews.",
  },
  {
    label: "Packaging & spillage",
    keywords: ["packaging", "spilled", "leaked", "leaking", "crushed", "container"],
    problem: "Reviews report leaking, spilled or crushed packaging on arrival.",
    opportunity: "Set packaging standards for spill-prone items, as reviewers suggest.",
  },
  {
    label: "Pricing, charges & coupons",
    keywords: ["expensive", "price", "pricing", "charges", "surge", "coupon", "offer", "discount", "overcharged", "delivery fee"],
    problem: "Reviews question prices, added charges, or coupons and offers not applying as expected.",
    opportunity: "Make charges and coupon rules explicit at checkout where reviewers ask for clarity.",
  },
  {
    label: "Refunds & payments",
    keywords: ["refund", "payment", "wallet", "money not", "deducted", "transaction", "failed payment", "cashback"],
    problem: "Reviews describe failed payments, deducted money, or refunds not received.",
    opportunity: "Give refund status visibility and self-serve payment recovery requested in reviews.",
  },
  {
    label: "Customer support",
    keywords: ["support", "customer care", "no response", "chatbot", "agent", "helpline", "complaint"],
    problem: "Reviews describe unresponsive or unhelpful support and unresolved complaints.",
    opportunity: "Offer faster escalation to a human where reviewers explicitly ask for it.",
  },
  {
    label: "App performance & stability",
    keywords: ["crash", "crashes", "bug", "hangs", "freeze", "lag", "slow app", "not loading", "login issue"],
    problem: "Reviews report crashes, freezes, slowness or sign-in failures in the app.",
    opportunity: "Prioritise stability work on the flows reviewers name.",
  },
  {
    label: "Search & discovery",
    keywords: ["search", "filter", "find restaurant", "recommendation", "browse", "sort"],
    problem: "Reviews describe difficulty finding restaurants or dishes through search, filters or sorting.",
    opportunity: "Extend filters and sorting options that reviewers request by name.",
  },
  {
    label: "Delivery partner experience",
    keywords: ["delivery partner", "rider", "driver", "delivery boy", "rude", "behaviour", "behavior"],
    problem: "Reviews describe negative interactions or conduct issues with delivery partners.",
    opportunity: "Add partner conduct feedback and follow-up that reviewers ask for.",
  },
  {
    label: "Order tracking",
    keywords: ["tracking", "track order", "live location", "map", "status"],
    problem: "Reviews describe inaccurate, stalled or missing order tracking and status updates.",
    opportunity: "Improve live tracking accuracy and status detail where reviewers request it.",
  },
];

const CHURN_RULES: { label: string; keywords: string[] }[] = [
  { label: "Explicit intent to stop using the product", keywords: ["uninstall", "deleting the app", "delete the app", "never order", "last time", "stop using", "won't use", "will not use", "done with"] },
  { label: "Switching to a competitor", keywords: ["switch", "switching", "swiggy", "competitor", "better app", "moved to", "instead of"] },
  { label: "Long-tenure customer expressing decline", keywords: ["used to be", "years", "loyal", "since", "gone downhill", "getting worse", "declined"] },
  { label: "Cancellation & refund escalation", keywords: ["cancel", "cancelled", "canceled", "refund not", "no refund", "chargeback"] },
];

const OPPORTUNITY_KEYWORDS = [
  "wish", "should add", "please add", "would be great", "hope you", "suggest", "feature request",
  "would love", "needs an option", "add an option", "allow us", "why can't", "why cant",
];

const NEGATIVE_WORDS = [
  "bad", "worst", "terrible", "awful", "poor", "horrible", "disappointed", "disappointing",
  "hate", "useless", "never", "problem", "issue", "annoying", "frustrating", "pathetic", "waste",
];

/** Minimum matched reviews before a pain point is reported at all. */
const MIN_PAIN_EVIDENCE = 5;
/** Minimum dated matched reviews before a trend is reported. */
const MIN_TREND_EVIDENCE = 10;
/** Minimum explicit requests before an opportunity is reported. */
const MIN_OPPORTUNITY_EVIDENCE = 3;
/** Minimum churn-language matches before churn relevance is reported. */
const MIN_CHURN_EVIDENCE = 3;

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

function matches(r: Review, keywords: string[]): boolean {
  const t = low(r);
  return keywords.some((k) => t.includes(k));
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

function buildConfidence(mentionCount: number, datedCount: number, total: number): Confidence {
  const share = total ? mentionCount / total : 0;
  const level: Confidence["level"] =
    mentionCount >= 200 && datedCount >= 50 ? "High" : mentionCount >= 50 ? "Moderate" : "Low";
  return {
    level,
    basis: `${mentionCount.toLocaleString()} matched reviews (${(share * 100).toFixed(1)}% of ${total.toLocaleString()}), ${datedCount.toLocaleString()} with dates`,
  };
}

export function analyze(reviews: Review[]): Analysis {
  const total = reviews.length;
  const rated = reviews.filter((r) => r.rating !== null) as (Review & { rating: number })[];
  const times = reviews
    .map((r) => (r.date ? Date.parse(r.date) : NaN))
    .filter((n) => !Number.isNaN(n));
  const split = median(times);

  // Single pass over the dataset: theme, churn and request membership.
  const themeMatched: Review[][] = THEMES.map(() => []);
  const churnMatched: Review[][] = CHURN_RULES.map(() => []);
  const churnSet = new Set<string>();
  const churnLabelsByReview = new Map<string, string[]>();
  const requestSet = new Set<string>();
  const requestReviews: Review[] = [];

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
      requestReviews.push(r);
    }
  }

  const themeInsights = THEMES.map((theme, i) => ({
    theme,
    matched: themeMatched[i]!,
    insight: buildInsight(`theme-${i}`, theme.label, themeMatched[i]!),
  })).filter((x) => x.insight !== null) as {
    theme: (typeof THEMES)[number];
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

  const opportunities = themeInsights
    .map(({ theme, insight }) =>
      buildInsight(
        `opp-${insight.id}`,
        theme.label,
        requestReviews.filter((r) => matches(r, theme.keywords)),
      ),
    )
    .filter((i): i is Insight => i !== null && i.reviewIds.length >= MIN_OPPORTUNITY_EVIDENCE)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

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

      const oppIds = insight.reviewIds.filter((id) => requestSet.has(id));
      const oppReviews = matched.filter((r) => requestSet.has(r.id));
      const opportunity: OpportunityEvidence =
        oppIds.length >= MIN_OPPORTUNITY_EVIDENCE
          ? {
              evidence: true,
              statement: theme.opportunity,
              reviewIds: oppIds,
              excerpts: oppReviews.slice(0, 3).map((r) => excerpt(r, OPPORTUNITY_KEYWORDS)),
            }
          : { evidence: false };

      return {
        ...insight,
        description: theme.problem,
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
