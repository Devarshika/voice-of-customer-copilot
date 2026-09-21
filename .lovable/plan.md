# Dataset-Agnostic Insight Engine

## Goal
Replace predefined topic matching with deterministic discovery of recurring customer problems from whichever review dataset is selected, without changing the dashboard, uploads, review feed, or evidence-linking interactions.

## Changes
- Remove predefined product/domain pain-point categories and opportunity templates from analysis.
- Discover candidate complaint phrases from negative reviews, then cluster semantically related wording using shared contextual terms and phrase overlap.
- Reject generic entities, standalone nouns, product names, and broad contexts unless they occur within a recurring problem expression.
- Generate each pain-point title and description from representative complaint phrases and supporting reviews.
- Keep every result linked to exact review IDs and verbatim excerpts; suppress weak clusters as insufficient evidence.
- Compute negative share from available ratings, using text-based negativity only to discover evidence when ratings are absent.
- Compare cluster counts across equal date periods for emerging trends, with actual counts and dates.
- Keep churn detection limited to explicit stop/switch/cancel/repeated-unresolved language.
- Derive priority from normalized volume, rated negative share, comparable trend, evidence consistency, and severity; expose those factors in the existing rationale text.
- Generate varied, domain-neutral intervention hypotheses from the cluster’s observed problem pattern and context, while preserving the pain point → reviews chain and validation warning.
- Update deterministic evaluation so consistency checks validate cluster phrases/context rather than old fixed keywords.

## Verification
- Confirm the default Uber dataset produces specific complaint clusters rather than generic entities.
- Test a second uploaded-style dataset with unrelated terminology to confirm no Uber-specific assumptions.
- Verify all supporting IDs resolve, excerpts remain verbatim, opportunity labels differ from pain-point labels, trends use dated evidence, and the existing cross-filtering still works.
- Check the preview for runtime errors and confirm the latest build succeeds.

## Technical details
The implementation remains local and deterministic. It will use normalized phrase extraction, document-frequency scoring, context signatures, overlap-based clustering, adaptive evidence thresholds, and stable IDs. No AI service, new page, persistence layer, or visual redesign is added.
