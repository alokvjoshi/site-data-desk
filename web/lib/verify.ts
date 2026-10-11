// Deterministic claim checks (PRD 5.4). Pure functions: unit tested in lib/verify.test.ts.

export function normalize(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `quote` appears verbatim (after whitespace, quote and emphasis normalisation) in `text`. */
export function quoteFound(text: string, quote: string): boolean {
  const q = normalize(quote);
  if (q.length < 10) return false;
  if (q.includes("…") || q.includes("...")) return false;
  return normalize(text).includes(q);
}

const WORD_RE = /[a-z0-9%<>]+(?:\.[0-9]+)*/gi;

/**
 * Word-exact fallback for quotes that differ from the source only in punctuation or spacing (a dropped comma or
 * bracket). Every word and number must still match, in order, contiguously. Returns the exact source span, which
 * replaces the model's quote so what is displayed and highlighted is always verbatim.
 */
export function snapQuote(text: string, quote: string): string | null {
  const q = (quote.toLowerCase().match(WORD_RE) ?? []);
  if (q.length < 5 || /…|\.\.\./.test(quote)) return null;
  const toks = [...text.matchAll(WORD_RE)].map((m) => ({ w: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
  for (let i = 0; i + q.length <= toks.length; i++) {
    if (toks[i].w !== q[0]) continue;
    if (q.every((w, k) => toks[i + k].w === w)) return text.slice(toks[i].start, toks[i + q.length - 1].end);
  }
  return null;
}

const NUM_RE =/\d[\d,]*(?:\.\d+)?/g;

export function numbersIn(s: string): string[] {
  return (s.match(NUM_RE) ?? []).map((n) => n.replace(/,/g, "").replace(/\.$/, ""));
}

/** Every number in `claim` must also appear in `source`. Returns the numbers that are missing. */
export function missingNumbers(claim: string, source: string): string[] {
  // Table cells can be "100 500" (two values) or "3 000" (one value written with a space), so accept both readings.
  const have = new Set([...numbersIn(source), ...numbersIn(source.replace(/(\d)\s(\d{3})\b/g, "$1$2"))]);
  have.add("");
  return numbersIn(claim).filter((n) => !have.has(n) && !have.has(n.replace(/^0+(?=\d)/, "")));
}

export function highlightRange(passage: string, quote: string): [number, number] | null {
  const q = normalize(quote);
  if (!q) return null;
  // map normalised indices back to the original string by walking character by character
  let norm = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < passage.length; i++) {
    const ch = passage[i];
    if (ch === "*" || ch === "`") continue;
    const c = normalize(ch === "\n" || ch === "\t" ? " " : ch);
    if (c === "" ) {
      if (!lastSpace) {
        norm += " ";
        map.push(i);
        lastSpace = true;
      }
      continue;
    }
    norm += c;
    for (let k = 0; k < c.length; k++) map.push(i);
    lastSpace = c === " ";
  }
  const at = norm.indexOf(q);
  if (at < 0) return null;
  return [map[at], map[at + q.length - 1] + 1];
}
