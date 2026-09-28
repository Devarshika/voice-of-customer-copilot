# Read-only candidate-cluster audit

## Confirmed finding
The currently selected Uber Reviews dataset contains 49,998 parsed reviews. Running the existing analysis unchanged produces exactly one Top Pain Point (Driver Cancelled, 429 supporting reviews), one Emerging Trend, one Prioritization item, and one Product Opportunity. The latter three are derived from that single accepted pain point.

The dashboard is not limiting these results to one: it can display up to six pain points, three trends, all prioritization items, and four opportunities. The analysis does limit what qualifies: complaint signatures are grouped and merged, candidate groups must pass minimum evidence, cohesion, completeness, and duplicate checks; prepared pain points with Low confidence are then excluded. Trends additionally require a sufficiently supported rise, and opportunities require sufficient supporting evidence. One accepted cluster does **not** prove that the dataset contains only one genuine customer problem; it means only one passed the current automated validation rules.

## Deeper audit
- Count candidate complaint groups at each existing gate: minimum supporting reviews, cluster cohesion/completeness, entity and duplicate rejection, and confidence acceptance.
- Identify the strongest excluded candidates with their evidence counts and the exact gate that removes each one.
- Trace how accepted pain points feed the trend, prioritization, and opportunity lists, distinguishing inherited one-item counts from separate filtering.
- Report the diagnosis only; do not alter thresholds, clustering, outputs, files, data, or presentation.

## Scope
No application code, dataset, UI, or analysis rules will be changed. This remains a diagnosis only.
