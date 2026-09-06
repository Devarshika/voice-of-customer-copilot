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
  status: "empty" | "loaded";
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

export type Analysis = {
  kpis: Kpis;
  painPoints: Insight[];
  trends: Trend[];
  churnSignals: Insight[];
  priorities: PriorityItem[];
  opportunities: Insight[];
};
