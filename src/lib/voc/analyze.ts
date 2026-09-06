import type { Analysis, Insight, PriorityItem, Review, Trend } from "./types";

/**
 * Theme lexicon. Insights are derived ONLY by matching these keywords against
 * the verbatim review text of the connected dataset. Nothing is invented:
 * a theme with zero matched reviews never appears.
 */
const THEMES: { label: string; keywords: string[] }[] = [
  { label: "Delivery speed & reliability", keywords: ["late", "delay", "delayed", "slow delivery", "took an hour", "waiting", "eta", "on time", "never arrived", "delivery time"] },
  { label: "Food quality & freshness", keywords: ["cold", "stale", "quality", "tasteless", "spoiled", "soggy", "fresh", "burnt", "raw"] },
  { label: "Order accuracy & missing items", keywords: ["missing", "wrong order", "wrong item", "incomplete", "not delivered", "different item"] },
  { label: "Packaging & spillage", keywords: ["packaging", "spilled", "leaked", "leaking", "crushed", "container"] },
  { label: "Pricing, charges & coupons", keywords: ["expensive", "price", "pricing", "charges", "surge", "coupon", "offer", "discount", "overcharged", "delivery fee"] },
  { label: "Refunds & payments", keywords: ["refund", "payment", "wallet", "money not", "deducted", "transaction", "failed payment", "cashback"] },
  { label: "Customer support", keywords: ["support", "customer care", "no response", "chatbot", "agent", "helpline", "complaint"] },
  { label: "App performance & stability", keywords: ["crash", "crashes", "bug", "hangs", "freeze", "lag", "slow app", "not loading", "login issue"] },
  { label: "Search & discovery", keywords: ["search", "filter", "find restaurant", "recommendation", "browse", "sort"] },
  { label: "Delivery partner experience", keywords: ["delivery partner", "rider", "driver", "delivery boy", "rude", "behaviour", "behavior"] },
  { label: "Order tracking", keywords: ["tracking", "track order", "live location", "map", "status"] },
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

const norm = (s: string) => s.toLowerCase();

function isNegative(r: Review): boolean {
  if (r.rating !== null) return r.rating <= 3;
  const t = norm(r.text);
  return NEGATIVE_WORDS.some((w) => t.includes(w));
}

function matches(text: string, keywords: string[]): boolean {
  const t = norm(text);
  return keywords.some((k) => t.includes(k));
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

export function analyze(reviews: Review[]): Analysis {
  const rated = reviews.filter((r) => r.rating !== null) as (Review & { rating: number })[];
  const times = reviews
    .map((r) => (r.date ? Date.parse(r.date) : NaN))
    .filter((n) => !Number.isNaN(n));

  const themeMatches = THEMES.map((t, i) => ({
    theme: t,
    insight: buildInsight(`theme-${i}`, t.label, reviews.filter((r) => matches(r.text, t.keywords))),
  })).filter((x) => x.insight !== null) as { theme: (typeof THEMES)[number]; insight: Insight }[];

  const painPoints = themeMatches
    .map(({ insight }) => insight)
    .filter((i) => i.negativeShare >= 0.5)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  const split = median(times);
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const trends: Trend[] = split
    ? themeMatches
        .map(({ insight }) => {
          let recent = 0;
          let earlier = 0;
          for (const id of insight.reviewIds) {
            const d = byId.get(id)?.date;
            const t = d ? Date.parse(d) : NaN;
            if (Number.isNaN(t)) continue;
            if (t >= split) recent += 1;
            else earlier += 1;
          }
          const changePct = earlier > 0 ? ((recent - earlier) / earlier) * 100 : null;
          return { ...insight, recent, earlier, changePct };
        })
        .filter((t) => t.recent + t.earlier >= 2)
        .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity))
    : [];

  const churnSignals = CHURN_RULES.map((rule, i) =>
    buildInsight(
      `churn-${i}`,
      rule.label,
      reviews.filter((r) => matches(r.text, rule.keywords) && isNegative(r)),
    ),
  )
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  const maxMentions = painPoints[0]?.reviewIds.length ?? 0;
  const priorities: PriorityItem[] = painPoints
    .map((p) => {
      const reach = maxMentions ? p.reviewIds.length / maxMentions : 0;
      const score = Math.round((reach * 0.65 + p.negativeShare * 0.35) * 100);
      return {
        ...p,
        id: `prio-${p.id}`,
        score,
        impact: score >= 70 ? "High" : score >= 40 ? "Medium" : "Low",
      } satisfies PriorityItem;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const requestReviews = reviews.filter((r) => matches(r.text, OPPORTUNITY_KEYWORDS));
  const opportunities = themeMatches
    .map(({ theme, insight }) =>
      buildInsight(
        `opp-${insight.id}`,
        theme.label,
        requestReviews.filter((r) => matches(r.text, theme.keywords)),
      ),
    )
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => b.reviewIds.length - a.reviewIds.length);

  return {
    kpis: {
      reviewCount: reviews.length,
      ratedCount: rated.length,
      avgRating: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null,
      negativeShare: reviews.length ? reviews.filter(isNegative).length / reviews.length : null,
      themeCount: themeMatches.length,
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

/** Every insight (of any kind) that a given review is evidence for. */
export function insightsForReview(analysis: Analysis, reviewId: string) {
  const groups: { kind: string; items: Insight[] }[] = [
    { kind: "Pain point", items: analysis.painPoints },
    { kind: "Emerging trend", items: analysis.trends },
    { kind: "Churn signal", items: analysis.churnSignals },
    { kind: "Prioritized", items: analysis.priorities },
    { kind: "Opportunity", items: analysis.opportunities },
  ];
  return groups
    .map((g) => ({ kind: g.kind, items: g.items.filter((i) => i.reviewIds.includes(reviewId)) }))
    .filter((g) => g.items.length > 0);
}
