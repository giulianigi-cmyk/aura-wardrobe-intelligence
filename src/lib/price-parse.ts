// Reading a price written by a person or by a shop page. Thousands and decimal separators differ by
// country — "6.850 €" (Italy), "$6,850" (US), "1.234,50", "1,234.50", "6 850 €" — and the old
// parsers treated a lone separator as the decimal point, so a 6,850 € Cartier bracelet became 6.85.

/** The numeric value of a price string, or null. Rules:
 *  - both "." and "," present → the LAST one is the decimal separator;
 *  - one kind repeated ("1.234.567") → thousands separators;
 *  - one separator followed by exactly 3 digits ("6.850", "6,850") → thousands (prices don't
 *    have 3 decimals);
 *  - one separator followed by 1–2 digits ("49,90", "49.9") → decimal;
 *  - spaces / apostrophes between digit groups ("6 850", "6'850") → thousands. */
export function parsePrice(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  // keep digits and separators; drop currency symbols/letters; join digit groups split by spaces/apostrophes
  const compact = input.replace(/(\d)[\s  '’](?=\d{3}\b)/g, "$1").replace(/[^\d.,]/g, "");
  const s = compact.replace(/^[.,]+|[.,]+$/g, "");
  if (!s || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let norm: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    norm = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    const isThousands = parts.length > 2 || (tail.length === 3 && parts[0].length >= 1 && parts[0] !== "0");
    norm = isThousands ? parts.join("") : `${parts[0]}.${tail}`;
  } else {
    norm = s;
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** For form fields: a positive price or null. */
export function parsePositivePrice(input: unknown): number | null {
  const n = parsePrice(input);
  return n != null && n > 0 ? n : null;
}
