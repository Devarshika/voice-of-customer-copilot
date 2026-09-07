import csvAsset from "@/assets/zomato_reviews_demo_100k.csv.asset.json";
import { parseReviewFile } from "./parse";
import type { Dataset, Review } from "./types";

/**
 * The Zomato Reviews demo dataset comes from exactly one place: the uploaded
 * zomato_reviews CSV. Only review_text, date and source exist in that file, so
 * rating, reviewer and vote fields stay null — nothing is filled in.
 */
export const ZOMATO_DATASET_ID = "zomato-reviews";

export const DEFAULT_DATASETS: Dataset[] = [
  {
    id: ZOMATO_DATASET_ID,
    name: "Zomato Reviews",
    status: "loading",
    reviews: [],
    origin: csvAsset.original_filename,
  },
];

export async function loadZomatoReviews(): Promise<Review[]> {
  const res = await fetch(csvAsset.url);
  if (!res.ok) throw new Error(`Failed to load ${csvAsset.original_filename}`);
  return parseReviewFile("zomato_reviews.csv", await res.text());
}
