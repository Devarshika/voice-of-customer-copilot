import type { Review } from "./types";

export type ProblemKind =
  | "blocked"
  | "cancelled"
  | "confusing"
  | "incorrect"
  | "missing"
  | "quality"
  | "reliability"
  | "slow"
  | "unavailable"
  | "unsafe";

export type ComplaintSignature = {
  reviewId: string;
  sentence: string;
  kind: ProblemKind;
  cue: string;
  context: string[];
  details: string[];
  consequence: string[];
  /** Other failure kinds expressed in the same sentence; separates compound mechanisms. */
  relatedKinds: ProblemKind[];
  severity: boolean;
  completeness: number;
};

const WORDS = /[\p{L}\p{N}']+/gu;
const SENTENCES = /[^.!?;\n]+/g;

export const FUNCTION_WORDS = new Set([
  "a","about","after","again","all","also","am","an","and","any","are","as","at","be","because","been","before","being","both","but","by","can","could","did","do","does","doing","during","each","even","ever","few","for","from","get","gets","getting","give","given","had","has","have","having","he","her","here","hers","herself","him","himself","his","how","i","if","in","into","is","it","its","itself","just","many","may","me","might","more","most","much","my","myself","no","nor","not","of","off","on","once","only","or","other","our","ours","out","over","own","same","she","should","so","some","such","than","that","the","their","theirs","them","themselves","then","there","these","they","this","those","through","to","too","under","until","up","us","very","was","we","were","what","when","where","which","while","who","why","will","with","would","you","your","yours",
]);

export const GENERIC_CONTEXT = new Set([
  "anything","app","application","brand","business","company","customer","customers","day","days","everything","experience","hour","hours","issue","issues","minute","minutes","month","months","nothing","one","overall","platform","problem","problems","product","products","quality","service","services","something","stuff","system","thing","things","time","times","use","user","users","way","week","weeks","whole",
]);

const CONTEXT_NOISE = new Set([
  "after","around","becom","become","became","before","confirm","continue","dur","during","finally","final","find","found","go","going","keep","keeps","longer","make","made","next","open","really","reopen","save","saved","see","seen","show","shows","start","started","step","try","tried","when","work","working",
]);

const CUES: Record<ProblemKind, Set<string>> = {
  blocked: new Set(["block","hard","difficult","reject","stuck","unable"]),
  cancelled: new Set(["cancel"]),
  confusing: new Set(["confus","mislead","unclear","understand"]),
  incorrect: new Set(["incorrect","wrong","overcharg","undercharg"]),
  missing: new Set(["lost","miss","omit","refund"]),
  quality: new Set(["annoy","awful","bad","disappoint","frustrat","horribl","poor","ridicul","rude","terribl","unaccept","useless","waste","worst"]),
  reliability: new Set(["broke","broken","crash","error","fail","fault","freez","glitch","spam"]),
  slow: new Set(["delay","lag","late","slow"]),
  unavailable: new Set(["unavail"]),
  unsafe: new Set(["fraud","scam","unsafe"]),
};

const NEGATIONS = new Set(["can't","cannot","cant","couldn't","couldnt","doesn't","doesnt","don't","dont","never","no","not","unable","won't","wont","wouldn't","wouldnt"]);
const NEGATABLE_ACTIONS = new Set([
  "accept","book","complete","connect","download","install","load","log","login","open","pay","process","register","save","send","sign","start","submit","sync","update","upload","verify","work",
]);
const SEVERE = new Set(["always","constantly","extremely","fraud","horribl","repeatedly","scam","terribl","unsafe","worst"]);
const CONSEQUENCES = new Set(["abandon","charge","cost","delete","leave","lose","lost","miss","pay","refund","restart","retry","stop","switch","uninstall","wait","waste"]);

export function normalizeWord(word: string): string {
  let value = word.toLowerCase().replace(/^'+|'+$/g, "");
  if (value.length > 6 && value.endsWith("ingly")) value = value.slice(0, -5);
  else if (value.length > 5 && value.endsWith("edly")) value = value.slice(0, -4);
  else if (value.length > 5 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith("ied")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss") && !value.endsWith("us") && !value.endsWith("is")) value = value.slice(0, -1);
  if (/([^aeiou])\1$/.test(value)) value = value.slice(0, -1);
  return value;
}

export function normalizedWords(text: string): string[] {
  return (text.toLowerCase().match(WORDS) ?? []).map(normalizeWord).filter(Boolean);
}

export function contentWords(text: string): string[] {
  return normalizedWords(text).filter(
    (word) => word.length > 2 && !FUNCTION_WORDS.has(word) && !GENERIC_CONTEXT.has(word),
  );
}

function cueKind(stem: string): ProblemKind | null {
  for (const [kind, stems] of Object.entries(CUES) as [ProblemKind, Set<string>][]) {
    if ([...stems].some((candidate) => stem === candidate || stem.startsWith(candidate))) return kind;
  }
  return null;
}

function informative(word: string, corpusCommon: Set<string>): boolean {
  return word.length > 2 && !FUNCTION_WORDS.has(word) && !GENERIC_CONTEXT.has(word) && !CONTEXT_NOISE.has(word) && !corpusCommon.has(word) && !cueKind(word) && !NEGATIONS.has(word);
}

export function corpusCommonTerms(reviews: Review[]): Set<string> {
  const frequency = new Map<string, number>();
  for (const review of reviews) {
    for (const word of new Set(normalizedWords(review.text))) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const cutoff = Math.max(20, Math.round(reviews.length * 0.42));
  return new Set([...frequency].filter(([, count]) => count >= cutoff).map(([word]) => word));
}

export function extractComplaintSignatures(review: Review, corpusCommon: Set<string>): ComplaintSignature[] {
  const found = new Map<string, ComplaintSignature>();
  const sentences = (review.text.match(SENTENCES) ?? []).map((part) => part.trim()).filter(Boolean).slice(0, 16);
  for (const sentence of sentences) {
    const raw = sentence.toLowerCase().match(WORDS) ?? [];
    const stems = raw.map(normalizeWord);
    const sentenceKinds = [...new Set(stems.map(cueKind).filter((kind): kind is ProblemKind => kind !== null && kind !== "quality"))];
    for (let cueIndex = 0; cueIndex < stems.length; cueIndex += 1) {
      let cue = stems[cueIndex] ?? "";
      let kind = cueKind(cue);
      if (!kind && NEGATIONS.has(raw[cueIndex] ?? "") && stems[cueIndex + 1] && NEGATABLE_ACTIONS.has(stems[cueIndex + 1] ?? "")) {
        cueIndex += 1;
        cue = stems[cueIndex] ?? "";
        kind = "reliability";
      }
      if (!kind) continue;

      const nearby = stems
        .map((word, index) => ({ word, index, distance: Math.abs(index - cueIndex) }))
        .filter((item) => item.index !== cueIndex && item.distance <= 6 && informative(item.word, corpusCommon))
        .sort((a, b) => a.distance - b.distance || Number(a.index > cueIndex) - Number(b.index > cueIndex));
      const context = [...new Set(nearby.slice(0, 2).map((item) => item.word))];
      if (context.length === 0) continue;
      const details = [...new Set(nearby.slice(2, 6).map((item) => item.word))];
      const consequence = [...new Set(stems.filter((word) => CONSEQUENCES.has(word) && word !== cue))].slice(0, 3);
      const signature: ComplaintSignature = {
        reviewId: review.id,
        sentence,
        kind,
        cue,
        context,
        details,
        consequence,
        relatedKinds: sentenceKinds.filter((related) => related !== kind),
        severity: stems.some((word) => SEVERE.has(word)),
        completeness: Math.min(1, 0.45 + (context.length >= 1 ? 0.25 : 0) + (details.length > 0 ? 0.15 : 0) + (consequence.length > 0 ? 0.15 : 0)),
      };
      const key = `${kind}|${context.slice().sort().join("-")}`;
      const prior = found.get(key);
      if (!prior || signature.completeness > prior.completeness) found.set(key, signature);
    }
  }
  return [...found.values()];
}

export function setSimilarity(left: Iterable<string>, right: Iterable<string>): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / union.size;
}

export function signatureCompatibility(a: ComplaintSignature, b: ComplaintSignature): number {
  const sameKind = a.kind === b.kind ? 1 : 0;
  const sameMechanism = a.kind === b.kind && setSimilarity(a.relatedKinds, b.relatedKinds) === (a.relatedKinds.length || b.relatedKinds.length ? 1 : 0) ? 1 : 0;
  const context = setSimilarity(a.context, b.context);
  const details = setSimilarity([...a.details, ...a.consequence], [...b.details, ...b.consequence]);
  if (!sameKind || !sameMechanism || context === 0) return 0;
  return 0.62 + context * 0.25 + details * 0.13;
}

/** A quality cue alone is sentiment, not a concrete failure proposition. */
export function isConcreteComplaint(signature: ComplaintSignature): boolean {
  if (signature.kind !== "quality") return true;
  return signature.consequence.length > 0 || signature.details.length >= 2;
}

export function describesProblem(label: string): boolean {
  const stems = normalizedWords(label);
  return stems.length >= 2 && stems.some((word) => !!cueKind(word)) && stems.some((word) => !cueKind(word) && !GENERIC_CONTEXT.has(word) && !FUNCTION_WORDS.has(word));
}

export function problemKindLabel(kind: ProblemKind): string {
  return {
    blocked: "Blocked",
    cancelled: "Cancelled",
    confusing: "Is Confusing",
    incorrect: "Is Incorrect",
    missing: "Is Missing",
    quality: "Has Poor Quality",
    reliability: "Fails",
    slow: "Is Slow or Delayed",
    unavailable: "Is Unavailable",
    unsafe: "Feels Unsafe",
  }[kind];
}