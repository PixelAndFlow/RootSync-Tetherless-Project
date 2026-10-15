/**
 * Text clean-up shared by every input format.
 *
 * Why this matters: Spanish content must survive import, storage, display and
 * export unchanged (é, ñ, ¿). Two things commonly break it:
 *  1. Unicode normalization. macOS often stores "é" as "e" + a combining accent
 *     (NFD) while Windows/Excel use one character (NFC). They look identical but
 *     compare as different strings, which breaks ID matching and duplicate checks.
 *     We convert everything to NFC.
 *  2. Wrong encoding. A UTF-8 file opened as Windows-1252 turns "é" into "Ã©".
 *     We detect that pattern and report it instead of importing garbled text.
 */

const BOM = "\uFEFF";

/** Strip BOM, normalize to NFC, unify line endings, trim. */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);
  if (s.startsWith(BOM)) s = s.slice(1);
  return s.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

/**
 * True when the text looks like UTF-8 that was decoded as Windows-1252/Latin-1,
 * e.g. "QuÃ©" instead of "Qué", or "â€œ" instead of a curly quote.
 */
export function looksMisencoded(s: string): boolean {
  return /\u00C3[\u0080-\u00BF]|\u00C2[\u00A0-\u00BF]|\u00E2\u20AC/.test(s) || s.includes("\uFFFD");
}

export type BilingualOrder = "es-en" | "en-es";

export interface SplitResult {
  en: string;
  es?: string;
  /** False when the text had no " / " separator (language-neutral text such as product names). */
  bilingual: boolean;
  /** True when more than one separator was found, so the split is ambiguous. */
  ambiguous: boolean;
}

/**
 * Split Kahoot-style "Spanish / English" text into two fields.
 *
 * Only " / " with spaces on both sides counts as the separator, so terms like
 * "EDR/XDR" or "TCP/IP" are left alone.
 */
export function splitBilingual(text: string, order: BilingualOrder = "es-en"): SplitResult {
  const parts = text.split(" / ");
  if (parts.length === 1) {
    return { en: text.trim(), bilingual: false, ambiguous: false };
  }
  if (parts.length > 2) {
    return { en: text.trim(), bilingual: false, ambiguous: true };
  }
  const [first, second] = parts.map((p) => p.trim()) as [string, string];
  return order === "es-en"
    ? { en: second, es: first, bilingual: true, ambiguous: false }
    : { en: first, es: second, bilingual: true, ambiguous: false };
}
