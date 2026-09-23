# Comprehensive Dataset-Agnostic Logic Correction

## Goal
Replace the current phrase-led and partly circular logic with one coherent, deterministic analysis and evaluation pipeline that discovers recurring customer problems from any selected review dataset, while preserving the existing dashboard, uploads, filters, evidence links, and review↔insight interactions.

## Analysis engine
- Build a shared, domain-neutral complaint representation for each review sentence: problem/action cue, affected context, consequence, nearby modifiers, and normalized content terms. Keep the exact review ID and matched sentence with every representation.
- Form initial problem groups from compatible complaint propositions, then merge groups best-first using context/action compatibility, evidence overlap, and corpus-derived similarity. Validate the merged cluster as a whole to prevent order-dependent merges, transitive drift, and near-duplicate pain points.
- Reject entity-only, vague, contradictory, weak, or incoherent clusters before display. Generate a concise problem title and description from representative propositions rather than the most frequent phrase.
- Derive mentions, dataset share, negative share, excerpts, and confidence strictly from the final supporting-review set. Confidence will combine evidence above an adaptive dataset threshold, cluster cohesion, proposition completeness, evidence relevance, and available rating coverage.
- Compare equal calendar windows with sufficient dataset and cluster observations for trends; retain actual counts and dates, and suppress tiny-baseline changes.
- Detect churn intent sentence-by-sentence with explicit behavioral language, contrast/negation guards, and minimum evidence. Ordinary complaints and low ratings will not qualify.
- Replace rank-only priority scoring with an explainable evidence index combining absolute and within-dataset factors: support share, rating-based negative share when available, reliable trend, cluster quality, confidence, and severity. Weak evidence cannot become High priority by rank alone.
- Generate opportunities only when evidence supports a reasonable intervention hypothesis. Infer the failure stage, consequence, and recoverability from representative propositions; produce varied, problem-specific hypotheses without claiming customers requested a feature. Reject unsupported or repetitive template-like output as insufficient evidence.

## Evaluation engine
- Preserve exact ID, excerpt, count, rating, date, churn-lineage, and opportunity-lineage validation.
- Evaluate claim support and cluster consistency independently of the generation seed phrases, using leave-one-out proposition compatibility, cluster cohesion, contamination checks against deterministic out-of-cluster controls, and representative-evidence coverage.
- Detect generic/non-problem insights from proposition completeness, context specificity, and whether the label describes a failure rather than an entity or noun.
- Evaluate opportunities for logical problem→intervention linkage, evidence-supported assumptions, specificity, non-paraphrase, and cross-opportunity template duplication.
- Mark semantic dimensions “Not evaluated” when the evidence sample is too small or lacks the information needed for a reliable check. Keep deterministic validation percentages explicitly separate from heuristic quality checks and never present either as AI accuracy.
- Keep the current evaluation screen structure, while ensuring its sample summary reports insights inspected, linked reviews inspected, claims checked, and flagged quality issues.

## Verification
- Add deterministic multi-domain fixtures containing paraphrased same-problem reviews, same-entity/different-problem reviews, generic entities, tiny-baseline trends, negated churn language, real churn intent, duplicate clusters, and repetitive/unsupported opportunities.
- Verify the current Uber dataset without any Uber-specific rules and at least two unrelated synthetic domains. Confirm no obvious duplicate pain points, all linked IDs resolve, excerpts are verbatim and relevant, and metrics match supporting evidence.
- Confirm dataset switching, uploads, filters, evidence navigation, and review↔insight cross-filtering remain unchanged.
- Verify the dashboard and AI Evaluation in the running app with no build, runtime, console, or interaction errors.

## Technical details
Keep the implementation deterministic and local. Extract shared complaint-signature and compatibility helpers so analysis and evaluation use the same linguistic primitives but separate acceptance logic. No external AI service, persistence, new page, visual redesign, or domain-specific vocabulary will be added.
