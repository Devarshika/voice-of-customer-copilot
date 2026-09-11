export type Review = {
  id: string;
  /** Verbatim review text. Never synthesized. */
  text: string;
  /** ISO date string if the source provided one, otherwise null. */
  date: string | null;
  /** 1-5 if the source provided one, otherwise null. */
  rating: number | null;
  /** e.g. "Zomato", "App Store" — null when the source did not provide it. */
  source: string | null;
  /** Any extra metadata columns present in the uploaded file. */
  extra?: Record<string, string> | undefined;
};

export type Dataset = {
  id: string;
  name: string;
  /** "empty" = structure ready, no review data connected yet. */
  status: "empty" | "loading" | "loaded";
  reviews: Review[];
  /** Where the rows came from, shown in the UI. */
  origin: string | null;
};

export type ThemeId = string;

export type Insight = {
  id: string;
  /** Theme label derived from matched keywords in real review text. */
  label: string;
  /** Ids of the reviews that matched — the evidence trail. */
  reviewIds: string[];
  /** 0-1, share of matched reviews that are negative. */
  negativeShare: number;
  /** Average rating across matched reviews that have one, else null. */
  avgRating: number | null;
};

export type Trend = Insight & {
  /** Mentions in the recent half vs the earlier half of the date range. */
  recent: number;
  earlier: number;
  changePct: number | null;
};

export type PriorityItem = Insight & {
  score: number;
  impact: "High" | "Medium" | "Low";
};

export type Kpis = {
  reviewCount: number;
  avgRating: number | null;
  ratedCount: number;
  negativeShare: number | null;
  themeCount: number;
  dateRange: { from: string; to: string } | null;
};

/** A verbatim excerpt, always carrying the id of the review it came from. */
export type Excerpt = {
  reviewId: string;
  text: string;
  date: string | null;
};

export type MonthPoint = { month: string; count: number };

/** "Insufficient evidence." is represented by evidence: false everywhere. */
export type TrendEvidence =
  | { evidence: false }
  | {
      evidence: true;
      earlier: number;
      recent: number;
      changePct: number | null;
      direction: "rising" | "falling" | "steady";
      months: MonthPoint[];
      window: { from: string; to: string };
    };

export type ChurnEvidence =
  | { evidence: false }
  | { evidence: true; reviewIds: string[]; share: number; signals: string[] };

export type OpportunityEvidence =
  | { evidence: false }
  | { evidence: true; statement: string; reviewIds: string[]; excerpts: Excerpt[] };

export type Confidence = {
  level: "High" | "Moderate" | "Low";
  /** Plain-language basis: counts only, never a fabricated score. */
  basis: string;
};

/** One fully evidence-backed pain point insight. */
export type PainPoint = Insight & {
  description: string;
  /** Lexicon terms whose presence in real review text produced the match. */
  keywords: string[];
  mentionCount: number;

  /** Share of the whole connected dataset mentioning this pain point. */
  datasetShare: number;
  excerpts: Excerpt[];
  trend: TrendEvidence;
  confidence: Confidence;
  churn: ChurnEvidence;
  priority: { score: number; rank: number; impact: "High" | "Medium" | "Low"; rationale: string };
  opportunity: OpportunityEvidence;
};

/** A solution hypothesis derived from — and traceable to — one pain point. */
export type OpportunityItem = Insight & {
  /** The pain point this opportunity addresses. */
  painLabel: string;
  painPointId: string;
};

export type Analysis = {
  kpis: Kpis;
  /** Full engine output: every pain point with its complete evidence bundle. */
  painPoints: PainPoint[];
  trends: Trend[];
  churnSignals: Insight[];
  priorities: PriorityItem[];
  opportunities: OpportunityItem[];
};
