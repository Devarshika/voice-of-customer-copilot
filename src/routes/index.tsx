import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/voc/AppHeader";
import { InsightsPanel } from "@/components/voc/InsightsPanel";
import { ReviewFeed, type FeedFilters } from "@/components/voc/ReviewFeed";
import { analyze } from "@/lib/voc/analyze";
import { DEFAULT_DATASETS, ZOMATO_DATASET_ID, loadZomatoReviews } from "@/lib/voc/datasets";
import { parseReviewFile } from "@/lib/voc/parse";
import type { Dataset, Insight } from "@/lib/voc/types";

const TITLE = "Voice of Customer Copilot — review insights for PMs";
const DESCRIPTION =
  "Turn large volumes of customer reviews into evidence-backed product insights: pain points, trends, churn signals and prioritization, each linked to the reviews behind it.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [datasets, setDatasets] = useState<Dataset[]>(DEFAULT_DATASETS);
  const [activeId, setActiveId] = useState(DEFAULT_DATASETS[0]!.id);
  const [error, setError] = useState<string | null>(null);
  const [activeInsight, setActiveInsight] = useState<Insight | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedFilters>({ query: "", source: "all", rating: "all" });

  const dataset = datasets.find((d) => d.id === activeId) ?? datasets[0]!;
  const analysis = useMemo(() => analyze(dataset.reviews), [dataset]);

  useEffect(() => {
    let cancelled = false;
    loadZomatoReviews()
      .then((reviews) => {
        if (cancelled) return;
        setDatasets((prev) =>
          prev.map((d) =>
            d.id === ZOMATO_DATASET_ID ? { ...d, status: "loaded", reviews } : d,
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setDatasets((prev) =>
          prev.map((d) => (d.id === ZOMATO_DATASET_ID ? { ...d, status: "empty" } : d)),
        );
        setError("Could not load the connected Zomato review file.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(file: File) {
    setError(null);
    try {
      const reviews = parseReviewFile(file.name, await file.text());
      if (reviews.length === 0) {
        setError("No review text column found in that file.");
        return;
      }
      const id = `${file.name}-${Date.now()}`;
      const next: Dataset = {
        id,
        name: file.name.replace(/\.(csv|json)$/i, ""),
        status: "loaded",
        reviews,
        origin: file.name,
      };
      setDatasets((prev) => [...prev, next]);
      setActiveId(id);
      setActiveInsight(null);
      setSelectedReviewId(null);
      setFilters({ query: "", source: "all", rating: "all" });
    } catch {
      setError("Could not read that file. Upload a CSV or JSON review export.");
    }
  }

  return (
    <div className="app-canvas relative min-h-screen w-full overflow-hidden text-ink">
      <div
        className="absolute -top-32 -right-24 size-[440px] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.7066 0.1185 205.51 / 0.55), transparent 70%)" }}
      />
      <div
        className="absolute top-1/3 -left-32 size-[420px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.5511 0.2242 268.2 / 0.5), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-40 right-1/4 size-[380px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.683 0.1481 49.92 / 0.4), transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-[1440px] px-6 py-5">
        <AppHeader
          datasets={datasets}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setActiveInsight(null);
            setSelectedReviewId(null);
          }}
          onUpload={handleUpload}
          error={error}
        />

        <div className="relative z-10 mt-4 grid grid-cols-[1fr_1.12fr] gap-4">
          <ReviewFeed
            dataset={dataset}
            analysis={analysis}
            filters={filters}
            onFiltersChange={setFilters}
            activeInsight={activeInsight}
            onClearInsight={() => setActiveInsight(null)}
            selectedReviewId={selectedReviewId}
            onSelectReview={setSelectedReviewId}
          />
          <InsightsPanel
            dataset={dataset}
            analysis={analysis}
            activeInsightId={activeInsight?.id ?? null}
            onSelectInsight={(i) => {
              setActiveInsight(i);
              setSelectedReviewId(null);
            }}
            selectedReviewId={selectedReviewId}
          />
        </div>
      </div>
    </div>
  );
}
