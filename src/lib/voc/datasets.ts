import type { Dataset } from "./types";

/**
 * The default dataset ships with no review rows. Reviews and metrics are only
 * ever shown once a real export is connected — nothing here is fabricated.
 */
export const DEFAULT_DATASETS: Dataset[] = [
  {
    id: "zomato-reviews",
    name: "Zomato Reviews",
    status: "empty",
    reviews: [],
    origin: null,
  },
];
