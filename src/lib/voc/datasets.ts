import csvAsset from "@/assets/uber_lovable_demo.csv.asset.json";
import { parseReviewFile } from "./parse";
import type { Dataset, Review } from "./types";

/**
 * The default Uber Reviews dataset comes from exactly one place: the uploaded
 * CSV. Its review ID, text, rating, likes, app version and timestamp are mapped
 * directly; unavailable fields stay null.
 */
export const DEFAULT_DATASET_ID = "uber-reviews";

export const DEFAULT_DATASETS: Dataset[] = [
  {
    id: DEFAULT_DATASET_ID,
    name: "Uber Reviews",
    status: "loading",
    reviews: [],
    origin: csvAsset.original_filename,
  },
];

export async function loadDefaultReviews(): Promise<Review[]> {
  const res = await fetch(csvAsset.url);
  if (!res.ok) throw new Error(`Failed to load ${csvAsset.original_filename}`);
  return parseReviewFile(csvAsset.original_filename, await res.text());
}
