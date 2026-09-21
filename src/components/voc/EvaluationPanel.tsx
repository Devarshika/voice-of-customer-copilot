import { useMemo } from "react";
import { evaluate, type CheckResult } from "@/lib/voc/evaluate";
import type { Analysis, Dataset, PainPoint } from "@/lib/voc/types";

const NOT_EVALUATED = "Not evaluated";

function statusTone(status: string) {
  return status === "Pass"
    ? "text-accent"
    : status === "Warn"
      ? "text-ink"
      : status === "Fail"
        ? "text-danger"
        : "text-ink-soft";
}

function CheckCard({ title, check }: { title: string; check: CheckResult }) {
  return (
    <div className="frost-inset rounded-xl p-3">
      <div className="text-[9.5px] font-semibold tracking-wider text-ink-soft uppercase">{title}</div>
      {check.evaluated ? (
        <>
          <div className={`mt-1 font-display text-[18px] leading-none font-semibold ${statusTone(check.status)}`}>
            {(check.ratio * 100).toFixed(1)}%
          </div>
          <div className="mt-1 text-[10.5px] text-ink-soft">
            {check.passed.toLocaleString()} of {check.checked.toLocaleString()} passed · {check.status}
          </div>
          <div className="mt-1 text-[10.5px] leading-relaxed text-ink-soft">{check.detail}</div>
          <div className="mt-1 text-[9.5px] text-ink-soft/80">
            {check.method === "exact"
              ? "Exact deterministic validation"
              : "Deterministic quality heuristic — not a semantic guarantee or AI accuracy score"}
          </div>
        </>
      ) : (
        <div className="mt-1 text-[11px] text-ink-soft">{NOT_EVALUATED}</div>
      )}
    </div>
  );
}

export function EvaluationPanel({
  dataset,
  analysis,
  onClose,
  onOpenEvidence,
}: {
  dataset: Dataset;
  analysis: Analysis;
  onClose: () => void;
  onOpenEvidence: (pain: PainPoint, reviewIds: string[]) => void;
}) {
  const evaluation = useMemo(() => evaluate(dataset.reviews, analysis), [dataset, analysis]);
  const byId = useMemo(
    () => new Map(analysis.painPoints.map((p) => [p.id, p])),
    [analysis],
  );

  return (
    <section className="frost-surface spec relative z-10 mt-4 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[15px] font-semibold">AI Evaluation</h2>
          <p className="mt-0.5 max-w-[70ch] text-[11px] leading-relaxed text-ink-soft">
            Exact checks validate evidence linkage and stated facts. Marked quality heuristics flag
            likely semantic issues but do not measure “AI accuracy.” Every figure is a pass rate over
            sampled insights or linked reviews; unavailable checks read “{NOT_EVALUATED}”.
          </p>
        </div>
        <button
          onClick={onClose}
          className="frost-inset cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-semibold"
        >
          Close
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="frost-inset rounded-xl p-3">
          <div className="text-[9.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Evaluation sample
          </div>
          <div className="mt-1 font-display text-[18px] leading-none font-semibold">
            {evaluation.sample.insights.toLocaleString()} insights
          </div>
          <div className="mt-1 text-[10.5px] text-ink-soft">
            of {evaluation.sample.insightsAvailable.toLocaleString()} available ·{" "}
            {evaluation.sample.reviewsChecked.toLocaleString()} linked reviews inspected
          </div>
        </div>
        <div className="frost-inset rounded-xl p-3">
          <div className="text-[9.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Unsupported claims detected
          </div>
          <div
            className={`mt-1 font-display text-[18px] leading-none font-semibold ${
              evaluation.unsupportedClaims.count > 0 ? "text-danger" : "text-accent"
            }`}
          >
            {evaluation.unsupportedClaims.evaluated
              ? evaluation.unsupportedClaims.count.toLocaleString()
              : NOT_EVALUATED}
          </div>
          <div className="mt-1 text-[10.5px] text-ink-soft">
            {evaluation.unsupportedClaims.evaluated
              ? `${evaluation.unsupportedClaims.checked.toLocaleString()} stated claims checked against linked evidence`
              : "No claims available to check"}
          </div>
        </div>
        <div className="frost-inset rounded-xl p-3">
          <div className="text-[9.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Overall status
          </div>
          <div className={`mt-1 font-display text-[18px] leading-none font-semibold ${statusTone(evaluation.overall)}`}>
            {evaluation.overall}
          </div>
          <div className="mt-1 text-[10.5px] text-ink-soft">
            Coverage:{" "}
            {evaluation.coverage.ratio === null
              ? NOT_EVALUATED
              : `${evaluation.coverage.evaluatedInsights} of ${evaluation.coverage.totalInsights} sampled insights evaluated (${Math.round(evaluation.coverage.ratio * 100)}%)`}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <CheckCard title="Evidence grounding" check={evaluation.grounding} />
        <CheckCard title="Theme / cluster consistency" check={evaluation.consistency} />
        <CheckCard title="Evidence relevance" check={evaluation.relevance} />
        <CheckCard title="Problem specificity" check={evaluation.specificity} />
        <CheckCard title="Opportunity grounding" check={evaluation.opportunityGrounding} />
      </div>

      <div className="mt-4">
        <div className="text-[9.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Flagged examples
        </div>
        {evaluation.flags.length === 0 ? (
          <div className="mt-1 text-[11px] text-ink-soft">
            {evaluation.overall === NOT_EVALUATED
              ? NOT_EVALUATED
              : "No flagged examples in the evaluated sample."}
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {evaluation.flags.map((f, i) => (
              <li key={`${f.insightId}-${i}`} className="frost-inset rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-semibold">{f.insightLabel}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{f.reason}</div>
                    <div className="mt-1 font-mono text-[10px] text-ink-soft">
                      Review IDs: {f.reviewIds.join(", ") || "—"}
                    </div>
                  </div>
                  {byId.has(f.insightId) ? (
                    <button
                      onClick={() => onOpenEvidence(byId.get(f.insightId)!, f.reviewIds)}
                      className="btn-brand spec shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                    >
                      Show these reviews
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
