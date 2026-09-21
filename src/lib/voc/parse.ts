import type { Review } from "./types";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const pick = (obj: Record<string, string>, names: string[]) => {
  for (const n of names) {
    const key = Object.keys(obj).find((k) => k.toLowerCase().trim() === n);
    if (key && obj[key]?.trim()) return obj[key].trim();
  }
  return null;
};

const TEXT_KEYS = ["review", "review_text", "text", "content", "comment", "body", "feedback"];
const ID_KEYS = ["review_id", "id"];
const DATE_KEYS = ["date", "review_date", "review_timestamp", "created_at", "timestamp", "time", "at"];
const RATING_KEYS = ["rating", "review_rating", "stars", "score", "star_rating"];
const SOURCE_KEYS = ["source", "platform", "channel", "app"];
const EXTRA_MAPPED_KEYS = ["review_likes", "author_app_version"];

function toReview(obj: Record<string, string>, index: number): Review | null {
  const text = pick(obj, TEXT_KEYS);
  if (!text) return null;
  const rawDate = pick(obj, DATE_KEYS);
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const rawRating = pick(obj, RATING_KEYS);
  const rating = rawRating !== null && rawRating !== "" ? Number(rawRating) : NaN;

  const used = new Set([
    ...ID_KEYS,
    ...TEXT_KEYS,
    ...DATE_KEYS,
    ...RATING_KEYS,
    ...SOURCE_KEYS,
    ...EXTRA_MAPPED_KEYS,
  ]);
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!used.has(k.toLowerCase().trim()) && v?.trim()) extra[k] = v.trim();
  }
  const likes = pick(obj, ["review_likes"]);
  const appVersion = pick(obj, ["author_app_version"]);
  if (likes !== null) extra["Helpful/likes"] = likes;
  if (appVersion !== null) extra["App version"] = appVersion;

  return {
    id: pick(obj, ID_KEYS) ?? `r-${index}`,
    text,
    date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
    rating: Number.isFinite(rating) && rating > 0 ? Math.min(5, Math.round(rating)) : null,
    source: pick(obj, SOURCE_KEYS),
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

/** Parse a CSV or JSON review export. Missing metadata stays null — never filled in. */
export function parseReviewFile(filename: string, content: string): Review[] {
  const rows: Record<string, string>[] = [];

  if (filename.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(content);
    const list: unknown[] = Array.isArray(data) ? data : (data?.reviews ?? []);
    for (const item of list) {
      if (item && typeof item === "object") {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
          if (v !== null && v !== undefined && typeof v !== "object") flat[k] = String(v);
        }
        rows.push(flat);
      }
    }
  } else {
    const table = parseCsv(content);
    const header = table[0] ?? [];
    for (const line of table.slice(1)) {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => (obj[h] = line[i] ?? ""));
      rows.push(obj);
    }
  }

  return rows.map(toReview).filter((r): r is Review => r !== null);
}
