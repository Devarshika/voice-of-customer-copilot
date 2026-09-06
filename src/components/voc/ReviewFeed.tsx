import { useMemo } from "react";
import type { Analysis, Dataset, Insight, Review } from "@/lib/voc/types";
import { insightsForReview } from "@/lib/voc/analyze";

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="text-[10px] text-ink-soft/70">Rating not provided</span>;
  }
  return (
    <div className="flex items-center gap-1.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "text-[12px] text-star" : "text-[12px] text-ink-soft/40"}>
          ★
        </span>
      ))}
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "Date not provided";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export type FeedFilters = {
  query: string;
  source: string;
  rating: string;
};

type Props = {
  dataset: Dataset;
  analysis: Analysis;
  filters: FeedFilters;
  onFiltersChange: (f: FeedFilters) => void;
  activeInsight: Insight | null;
  onClearInsight: () => void;
  selectedReviewId: string | null;
  onSelectReview: (id: string | null) => void;
};

export function ReviewFeed({
  dataset,
  analysis,
  filters,
  onFiltersChange,
  activeInsight,
  onClearInsight,
  selectedReviewId,
  onSelectReview,
}: Props) {
  const sources = useMemo(() => {
    const set = new Set<string>();
    dataset.reviews.forEach((r) => r.source && set.add(r.source));
    return [...set].sort();
  }, [dataset.reviews]);

  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return dataset.reviews.filter((r: Review) => {
      if (activeInsight && !activeInsight.reviewIds.includes(r.id)) return false;
      if (q && !r.text.toLowerCase().includes(q)) return false;
      if (filters.source !== "all" && r.source !== filters.source) return false;
      if (filters.rating === "low" && !(r.rating !== null && r.rating <= 3)) return false;
      if (filters.rating === "high" && !(r.rating !== null && r.rating >= 4)) return false;
      if (filters.rating === "none" && r.rating !== null) return false;
      return true;
    });
  }, [dataset.reviews, filters, activeInsight]);

  const selectClass =
    "frost-inset rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink outline-none focus:ring-2 focus:ring-brand/40";

  return (
    <section className="frost-surface flex h-[720px] flex-col overflow-hidden rounded-2xl">
      <div className="border-b border-white/50 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Customer Voice</h2>
          <span className="text-[11px] text-ink-soft">
            {dataset.status === "empty"
              ? "No reviews connected"
              : `${visible.length.toLocaleString()} of ${dataset.reviews.length.toLocaleString()} reviews`}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={filters.query}
            onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
            placeholder="Search reviews…"
            className="frost-inset flex-1 rounded-lg px-3 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-soft focus:ring-2 focus:ring-brand/40"
          />
          <select
            value={filters.source}
            onChange={(e) => onFiltersChange({ ...filters, source: e.target.value })}
            className={selectClass}
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filters.rating}
            onChange={(e) => onFiltersChange({ ...filters, rating: e.target.value })}
            className={selectClass}
            aria-label="Filter by rating"
          >
            <option value="all">Rating: All</option>
            <option value="low">1–3 ★</option>
            <option value="high">4–5 ★</option>
            <option value="none">No rating</option>
          </select>
        </div>

        {activeInsight ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-medium text-ink-soft">Linked to insight:</span>
            <button
              onClick={onClearInsight}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand/12 px-2.5 py-1 text-[11px] font-medium text-brand"
            >
              {activeInsight.label} <span className="text-brand/60">✕</span>
            </button>
          </div>
        ) : (
          <div className="mt-3 text-[10px] text-ink-soft">
            Select an insight on the right to see only its supporting reviews.
          </div>
        )}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {dataset.status === "empty" ? (
          <div className="frost-inset rounded-xl p-4 text-center">
            <div className="text-[12px] font-medium text-ink">No review data connected</div>
            <p className="mt-1 text-[11px] text-ink-soft">
              Placeholder — upload a CSV or JSON review export with “+ Add Dataset” and the real
              verbatims will appear here.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="frost-inset rounded-xl p-4 text-center text-[11px] text-ink-soft">
            No reviews match the current filters.
          </div>
        ) : (
          visible.map((r) => {
            const isSelected = selectedReviewId === r.id;
            const linked = isSelected ? insightsForReview(analysis, r.id) : [];
            return (
              <article
                key={r.id}
                onClick={() => onSelectReview(isSelected ? null : r.id)}
                className={`frost-inset cursor-pointer rounded-xl p-3 ${
                  isSelected ? "ring-1 ring-brand/40" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <Stars rating={r.rating} />
                  <span className="text-[10px] text-ink-soft">{formatDate(r.date)}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{r.text}</p>
                <div className="mt-2.5 flex items-center gap-2 text-[10px] text-ink-soft">
                  <span className="rounded-md bg-frost-deep/60 px-1.5 py-0.5">
                    {r.source ?? "Source not provided"}
                  </span>
                  {r.extra
                    ? Object.entries(r.extra)
                        .slice(0, 2)
                        .map(([k, v]) => (
                          <span key={k}>
                            {k}: {v}
                          </span>
                        ))
                    : null}
                  {(() => {
                    const count = insightsForReview(analysis, r.id).reduce(
                      (n, g) => n + g.items.length,
                      0,
                    );
                    return count > 0 ? (
                      <span className="ml-auto font-medium text-brand">
                        Supports {count} insight{count === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="ml-auto">No insight match</span>
                    );
                  })()}
                </div>

                {isSelected ? (
                  <div className="mt-2.5 border-t border-white/60 pt-2.5">
                    <div className="text-[10px] font-semibold tracking-wider text-ink-soft uppercase">
                      Contributes to
                    </div>
                    {linked.length === 0 ? (
                      <p className="mt-1 text-[11px] text-ink-soft">
                        This review does not currently support any derived insight.
                      </p>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {linked.flatMap((g) =>
                          g.items.map((i) => (
                            <span
                              key={g.kind + i.id}
                              className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand"
                            >
                              {g.kind}: {i.label}
                            </span>
                          )),
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
