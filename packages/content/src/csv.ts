/**
 * Minimal RFC 4180 CSV parser (no dependencies).
 *
 * Handles quoted fields, escaped quotes (""), commas and line breaks inside
 * quotes, CRLF line endings, and a leading byte-order mark. It also detects
 * semicolon-separated files, which Excel produces in Spanish-language locales.
 */

export type Delimiter = "," | ";" | "\t";

/** Pick the delimiter that appears most often in the header line (outside quotes). */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) counts[ch]++;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

export interface CsvParseResult {
  rows: string[][];
  delimiter: Delimiter;
  /** Record number (1-based, as a spreadsheet shows it) where an unclosed quote started. */
  unterminatedQuoteAtRow?: number;
}

export function parseCsv(input: string, delimiter?: Delimiter): CsvParseResult {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    row.push(field);
    rows.push(row);
    return { rows, delimiter: delim, unterminatedQuoteAtRow: rows.length };
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows, delimiter: delim };
}
