# Dataset-Agnostic Insight Quality Refinement

## Goal
Improve the existing deterministic analysis and evaluation engines so they identify coherent recurring customer problems—not frequent entities or vague phrases—across any uploaded review dataset, while preserving the current dashboard, uploads, filters, evidence links, and cross-filtering behavior.

## Analysis changes
- Replace broad failure-word merging with structured complaint signatures built from each review’s problem cue, affected context, nearby action, and normalized phrase evidence.
- Merge wording variants only when their problem signatures are compatible and their supporting-review/context evidence is sufficiently similar; prevent a shared entity or generic failure word from merging distinct problems.
- Reject vague or non-problem clusters before display using evidence-size, proposition completeness, semantic coherence, context specificity, and contradiction/noise checks.
- Generate concise problem labels and descriptions from representative complaint propositions while keeping all labels traceable to actual wording and all linked IDs resolvable.
- Base confidence on support above the dataset-adaptive threshold, signature consistency, relevant-evidence share, context specificity, and rating coverage—not volume alone.
- Report trends only from dated cluster evidence across equal periods when both periods and absolute counts meet adaptive minimums; retain actual counts and date windows.
- Keep churn limited to explicit behavioral-intent language and linked review evidence.
- Keep prioritization evidence-derived, but suppress generic clusters and explain volume, negative share, reliable trend, cluster quality, and severity factors.
- Generate opportunities from the cluster’s observed failure, affected context, and consequences. Require a specific, logically connected intervention hypothesis; otherwise return “Insufficient evidence.” Preserve the opportunity → pain point → reviews chain.

## Evaluation changes
- Keep ID resolution and numeric claim validation as deterministic grounding checks.
- Replace phrase-presence consistency with review-to-problem signature compatibility across a bounded sample of linked reviews.
- Evaluate excerpt relevance using the same underlying-problem signature plus verbatim/link validation, rather than keyword overlap alone.
- Add generic/non-problem detection for entity-only, noun-only, vague, or incomplete labels/clusters.
- Add opportunity grounding checks for problem/intervention linkage, specificity, non-paraphrase, and unsupported assumptions.
- Mark checks “Not evaluated” when the available evidence cannot support a reliable result.
- Preserve the current evaluation screen structure while adding the new quality dimensions and clarifying that percentages are deterministic validation pass rates, not AI accuracy.

## Verification
- Test the connected Uber reviews without any Uber-specific terms, categories, or templates in analysis/evaluation code; confirm vague results such as “Something Wrong” are rejected.
- Test the unrelated connected review dataset and a synthetic multi-domain fixture containing paraphrased same-problem reviews plus same-entity/different-problem reviews.
- Verify linked IDs, verbatim excerpts, counts, rating-based negative share, trend windows, conservative churn evidence, priority rationale, and opportunity lineage.
- Confirm AI Evaluation flags intentionally generic, incoherent, irrelevant, and repetitive-opportunity fixtures while valid clusters pass applicable checks.
- Verify dataset switching and insight/review cross-filtering remain current, and confirm no build or runtime errors.

## Technical details
Extract shared, domain-neutral complaint-signature helpers into a small analysis utility so generation and evaluation use the same linguistic representation but separate acceptance checks. Use deterministic token normalization, local context/action windows, corpus-derived common-term filtering, adaptive thresholds, signature similarity, and evidence ratios. No external AI service, persistence, new page, or visual redesign is introduced.