# Targeted analysis-quality improvement

## Scope
- Preserve the dashboard, datasets, filters, metrics, trends, churn, evidence navigation, and review-to-insight interactions.
- Change only complaint-cluster validation, pain-point deduplication, opportunity generation, and their deterministic evaluation checks.

## Implementation
- Strengthen complaint propositions with dataset-derived mechanism, affected context, consequence, and recovery evidence.
- Merge same-kind candidate clusters only when their overall review evidence supports the same failure mechanism; validate cohesion after each proposed merge and keep different mechanisms separate even when they share context words.
- Reject broad quality judgments and entity/noun-only groups unless enough reviews contain a concrete, coherent failure proposition; generate titles from the validated mechanism and context.
- Recompute every pain-point metric and downstream lineage from the final merged evidence set.
- Generate opportunities only when the cluster provides a specific mechanism plus consequence or recovery signal, choosing evidence-derived intervention directions instead of reusable problem-kind templates; otherwise return “Insufficient evidence.”
- Extend evaluation with pairwise duplicate-overlap checks, concrete-proposition checks, and cross-opportunity structural similarity checks while continuing to label semantic checks as deterministic heuristics, not AI accuracy.

## Verification
- Add deterministic unrelated-domain fixtures covering paraphrased duplicates, shared-entity/different-mechanism complaints, vague quality statements, and differentiated opportunities.
- Run the current dataset and fixtures; verify all IDs/excerpts resolve, cancellation variants consolidate, distinct problems remain separate, vague clusters are absent, and opportunity wording is materially distinct.
- Check the running dashboard and AI Evaluation for unchanged interactions and no runtime or build errors.
