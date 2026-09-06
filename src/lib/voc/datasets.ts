import rawZomato from "./zomato-reviews.json";
import type { Dataset, Review } from "./types";

/**
 * Real Zomato restaurant reviews (verbatim text, rating, date, restaurant and
 * reviewer as published). Sampled evenly from a public Zomato reviews export —
 * nothing in here is synthesized.
 */
const ZOMATO_REVIEWS = rawZomato as Review[];

export const DEFAULT_DATASETS: Dataset[] = [
  {
    id: "zomato-reviews",
    name: "Zomato Reviews",
    status: "loaded",
    reviews: ZOMATO_REVIEWS,
    origin: "Zomato Restaurant reviews (public export, 1,500-review sample)",
  },
];
