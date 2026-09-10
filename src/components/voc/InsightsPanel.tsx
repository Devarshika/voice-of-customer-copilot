import { useState } from "react";
import type { Analysis, Dataset, Insight, PainPoint } from "@/lib/voc/types";

const INSUFFICIENT = "Insufficient evidence.";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold tracking-wider text-ink-soft uppercase">{label}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

function Sparkline({ points }: { points: { month: string; count: number }[] }) {
  const max = Math.max(...points.map((p) => p.count), 1);
  return (
    <div className="mt-1 flex h-8 items-end gap-[2px]">
      {points.map((p) => (
        <div
          key={p.month}
          title={`${p.month}: ${p.count} mentions`}
          className="flex-1 rounded-sm bg-brand/50"
          style={{ height: `${Math.max(8, (p.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function PainPointCard({
  pain,
  active,
  expanded,
  supportsSelectedReview,
  onSelect,
  onToggleExpand,
  maxMentions,
}: {
  pain: PainPoint;
  active: boolean;
  expanded: boolean;
  supportsSelectedReview: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  maxMentions: number;
}) {
  const { trend, churn, opportunity, confidence, priority } = pain;
  return (
    <div
      className={`frost-inset rounded-xl p-3 ${
        active
          ? "bg-brand/5 ring-1 ring-brand/40"
          : supportsSelectedReview
            ? "ring-1 ring-accent/50"
            : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button onClick={onSelect} className="cursor-pointer text-left">
          <span className="text-[13px] font-medium">{pain.label}</span>
          <span className="ml-2 text-[10px] text-ink-soft">#{priority.rank}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md bg-frost-deep/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-soft">
            {confidence.level} confidence
          </span>
          <span
            className="rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-mark)" }}
          >
            {priority.impact}
          </span>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{pain.description}</p>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-frost-deep/70">
        <div
          className={active ? "h-full bg-brand" : "h-full bg-brand/70"}
          style={{ width: `${Math.max(4, Math.round((pain.mentionCount / maxMentions) * 100))}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-ink-soft">
        <span className="font-medium text-ink">
          {pain.mentionCount.toLocaleString()} mentions
        </span>
        <span>· {(pain.datasetShare * 100).toFixed(1)}% of dataset</span>
        <span>· {Math.round(pain.negativeShare * 100)}% negative</span>
        <span>
          ·{" "}
          {trend.evidence
            ? `${trend.direction}${trend.changePct !== null ? ` ${trend.changePct > 0 ? "+" : ""}${Math.round(trend.changePct)}%` : ""}`
            : "trend: insufficient evidence"}
        </span>
        <button onClick={onSelect} className="ml-auto cursor-pointer font-medium text-brand">
          Filter reviews
        </button>
        <button onClick={onToggleExpand} className="cursor-pointer font-medium text-brand">
          {expanded ? "Hide evidence" : "Evidence"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-white/60 pt-3">
          <Field label="Trend over time (actual review dates)">
            {trend.evidence ? (
              <>
                <div>
                  {trend.earlier.toLocaleString()} → {trend.recent.toLocaleString()} dated mentions
                  (earlier vs recent half of {trend.window.from} → {trend.window.to})
                </div>
                <Sparkline points={trend.months} />
              </>
            ) : (
              INSUFFICIENT
            )}
          </Field>

          <Field label="Confidence basis">{confidence.basis}</Field>

          <Field label="Potential churn relevance">
            {churn.evidence
              ? `${churn.reviewIds.length.toLocaleString()} of these reviews (${Math.round(churn.share * 100)}%) also contain churn-risk language — ${churn.signals.join("; ")}. Signal only, not a prediction about any individual customer.`
              : INSUFFICIENT}
          </Field>

          <Field label="AI-assisted priority">
            Score {priority.score}/100 · rank #{priority.rank} · {priority.impact} impact.{" "}
            {priority.rationale}
          </Field>

          <Field label="Potential product opportunity">
            {opportunity.evidence ? (
              <>
                <div>{opportunity.statement}</div>
                <div className="mt-1 text-[10px] text-ink-soft">
                  Based on {opportunity.reviewIds.length.toLocaleString()} reviews that explicitly
                  request something. Potential opportunity only — requires further customer
                  validation, not a roadmap decision.
                </div>

                <ul className="mt-1.5 space-y-1">
                  {opportunity.excerpts.map((e) => (
                    <li key={e.reviewId} className="text-[10.5px] text-ink-soft italic">
                      “{e.text}” <span className="not-italic">— {e.reviewId}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              INSUFFICIENT
            )}
          </Field>

          <Field label={`Supporting review excerpts (${pain.mentionCount.toLocaleString()} review IDs)`}>
            <ul className="space-y-1.5">
              {pain.excerpts.map((e) => (
                <li key={e.reviewId} className="frost-inset rounded-lg p-2">
                  <p className="text-[10.5px] leading-relaxed text-ink italic">“{e.text}”</p>
                  <div className="mt-1 text-[9.5px] text-ink-soft">
                    {e.reviewId}
                    {e.date ? ` · ${e.date.slice(0, 10)}` : " · date not provided"}
                  </div>
                </li>
              ))}
            </ul>
            <button onClick={onSelect} className="mt-1.5 cursor-pointer text-[10px] font-medium text-brand">
              Show all {pain.mentionCount.toLocaleString()} supporting reviews on the left →
            </button>
          </Field>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  dataset: Dataset;
  analysis: Analysis;
  activeInsightId: string | null;
  onSelectInsight: (insight: Insight | null) => void;
  selectedReviewId: string | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="frost-inset rounded-xl p-3 text-[11px] text-ink-soft">{children}</div>;
}

function InsightRow({
  insight,
  active,
  supportsSelectedReview,
  onClick,
  right,
  meta,
  bar,
}: {
  insight: Insight;
  active: boolean;
  supportsSelectedReview: boolean;
  onClick: () => void;
  right?: React.ReactNode;
  meta?: React.ReactNode;
  bar?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`frost-inset w-full cursor-pointer rounded-xl p-3 text-left ${
        active ? "bg-brand/5 ring-1 ring-brand/40" : supportsSelectedReview ? "ring-1 ring-accent/50" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{insight.label}</span>
        <span className={`text-[10px] font-semibold ${active ? "text-brand" : "text-ink-soft"}`}>
          {right ?? `${insight.reviewIds.length} mentions`}
        </span>
      </div>
      {typeof bar === "number" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-frost-deep/70">
          <div
            className={active ? "h-full bg-brand" : "h-full bg-brand/70"}
            style={{ width: `${Math.max(4, Math.round(bar * 100))}%` }}
          />
        </div>
      ) : null}
      <div className="mt-2 text-[10.5px] text-ink-soft">{meta ?? "Click to filter reviews"}</div>
    </button>
  );
}

export function InsightsPanel({
  dataset,
  analysis,
  activeInsightId,
  onSelectInsight,
  selectedReviewId,
}: Props) {
  const { kpis } = analysis;
  const empty = dataset.status === "empty";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const maxMentions = Math.max(...analysis.painPoints.map((p) => p.mentionCount), 1);
  const supports = (i: Insight) => !!selectedReviewId && i.reviewIds.includes(selectedReviewId);
  const toggle = (i: Insight) => onSelectInsight(activeInsightId === i.id ? null : i);

  return (
    <section className="frost-surface flex h-[720px] flex-col overflow-hidden rounded-2xl">
      <div className="border-b border-white/50 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">AI Insights</h2>
          <span className="text-[10.5px] text-ink-soft">
            {dataset.status === "loading"
              ? "Reading connected review file…"
              : empty
                ? "Awaiting connected data"
                : "Derived from connected review text"}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="frost-inset rounded-xl p-3">
            <div className="text-[10px] font-medium tracking-wider text-ink-soft uppercase">
              Reviews
            </div>
            <div className="mt-1 font-display text-xl font-semibold">
              {kpis.reviewCount ? kpis.reviewCount.toLocaleString() : "—"}
            </div>
            <div className="mt-1 text-[10px] text-ink-soft">
              {kpis.dateRange ? `${kpis.dateRange.from} → ${kpis.dateRange.to}` : "No dates in data"}
            </div>
          </div>
          <div className="frost-inset rounded-xl p-3">
            <div className="text-[10px] font-medium tracking-wider text-ink-soft uppercase">
              Avg. rating
            </div>
            <div className="mt-1 font-display text-xl font-semibold">
              {kpis.avgRating !== null ? kpis.avgRating.toFixed(2) : "—"}
            </div>
            <div className="mt-1 text-[10px] text-ink-soft">
              {kpis.ratedCount ? `${kpis.ratedCount.toLocaleString()} rated` : "No ratings in data"}
            </div>
          </div>
          <div className="frost-inset rounded-xl p-3">
            <div className="text-[10px] font-medium tracking-wider text-ink-soft uppercase">
              Negative share
            </div>
            <div className="mt-1 font-display text-xl font-semibold">
              {kpis.negativeShare !== null ? `${Math.round(kpis.negativeShare * 100)}%` : "—"}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-frost-deep/70">
              <div
                className="h-full bg-signal"
                style={{ width: `${Math.round((kpis.negativeShare ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Top Pain Points</SectionLabel>
          {analysis.painPoints.length === 0 ? (
            <Placeholder>
              {dataset.status === "loaded"
                ? "Insufficient evidence."
                : "Pain points are extracted from the wording of connected reviews. None to show yet."}
            </Placeholder>
          ) : (
            <div className="space-y-2">
              {analysis.painPoints.slice(0, 6).map((p) => (
                <PainPointCard
                  key={p.id}
                  pain={p}
                  active={activeInsightId === p.id}
                  expanded={expandedId === p.id}
                  supportsSelectedReview={supports(p)}
                  onSelect={() => toggle(p)}
                  onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  maxMentions={maxMentions}
                />
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <SectionLabel>Emerging Trends</SectionLabel>
            {analysis.trends.length === 0 ? (
              <Placeholder>Insufficient evidence.</Placeholder>
            ) : (
              <div className="space-y-2">
                {analysis.trends.slice(0, 3).map((t) => (
                  <InsightRow
                    key={t.id}
                    insight={t}
                    active={activeInsightId === t.id}
                    supportsSelectedReview={supports(t)}
                    onClick={() => toggle(t)}
                    right={t.changePct !== null ? `${t.changePct > 0 ? "+" : ""}${Math.round(t.changePct)}%` : "new"}
                    meta={`${t.earlier} → ${t.recent} mentions`}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <SectionLabel>Potential Churn Signals</SectionLabel>
            {analysis.churnSignals.length === 0 ? (
              <Placeholder>Insufficient evidence.</Placeholder>
            ) : (
              <div className="space-y-2">
                {analysis.churnSignals.slice(0, 3).map((c) => (
                  <InsightRow
                    key={c.id}
                    insight={c}
                    active={activeInsightId === c.id}
                    supportsSelectedReview={supports(c)}
                    onClick={() => toggle(c)}
                    right={`${c.reviewIds.length} reviews`}
                    meta="Click to review the evidence"
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <SectionLabel>AI Prioritization</SectionLabel>
          {analysis.priorities.length === 0 ? (
            <Placeholder>Insufficient evidence.</Placeholder>
          ) : (
            <div className="space-y-2">
              {analysis.priorities.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  className={`frost-inset w-full cursor-pointer rounded-xl p-3 text-left ${
                    activeInsightId === p.id ? "bg-brand/5 ring-1 ring-brand/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12.5px] font-medium">{p.label}</span>
                    <span
                      className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"
                      style={{ background: "var(--gradient-mark)" }}
                    >
                      {p.impact} impact
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-ink-soft">
                    Score {p.score}/100 · {p.reviewIds.length} supporting reviews
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Potential Product Opportunities</SectionLabel>
          {analysis.opportunities.length === 0 ? (
            <Placeholder>Insufficient evidence.</Placeholder>
          ) : (
            <div className="space-y-2">
              {analysis.opportunities.slice(0, 4).map((o) => (
                <button
                  key={o.id}
                  onClick={() => toggle(o)}
                  className={`frost-inset w-full cursor-pointer rounded-xl border-l-2 border-l-accent p-3 text-left ${
                    activeInsightId === o.id ? "bg-brand/5 ring-1 ring-brand/40" : ""
                  }`}
                >
                  <div className="text-[12.5px] font-medium">{o.label}</div>
                  <div className="mt-1 text-[11px] text-ink-soft">
                    {o.reviewIds.length} request{o.reviewIds.length === 1 ? "" : "s"} in connected
                    reviews
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {empty ? (
          <div className="frost-inset rounded-xl p-3 text-center">
            <div className="text-[11px] text-ink-soft">
              All figures above stay blank until a real dataset is connected.
            </div>
            <div className="mt-1 text-[10px] text-ink-soft/70">
              Placeholder — no metrics are estimated or simulated.
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
