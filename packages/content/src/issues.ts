/**
 * Validation issues reported by the importer.
 *
 * Every problem the importer finds becomes an Issue instead of an exception,
 * so RCO staff see every problem in a file at once, with the row and field
 * that caused it, rather than fixing one error per run.
 */

export type Severity = "error" | "warning" | "info";

export interface IssueLocation {
  /** 1-based spreadsheet row (row 1 is the header). */
  row?: number;
  /** Column name in the source file, or a JSON path such as questions[3].prompt.en */
  field?: string;
  question_id?: string;
}

export interface Issue {
  severity: Severity;
  /** Stable machine-readable code, e.g. DUPLICATE_QUESTION_ID. */
  code: string;
  /** Plain-language explanation aimed at the person fixing the file. */
  message: string;
  location?: IssueLocation;
}

export class IssueList {
  readonly items: Issue[] = [];

  error(code: string, message: string, location?: IssueLocation): void {
    this.items.push({ severity: "error", code, message, location });
  }

  warning(code: string, message: string, location?: IssueLocation): void {
    this.items.push({ severity: "warning", code, message, location });
  }

  info(code: string, message: string, location?: IssueLocation): void {
    this.items.push({ severity: "info", code, message, location });
  }

  addAll(issues: readonly Issue[]): void {
    this.items.push(...issues);
  }

  get hasErrors(): boolean {
    return this.items.some((i) => i.severity === "error");
  }
}

export function formatLocation(loc: IssueLocation | undefined): string {
  if (!loc) return "";
  const parts: string[] = [];
  if (loc.row !== undefined) parts.push(`row ${loc.row}`);
  if (loc.field) parts.push(loc.field);
  if (loc.question_id) parts.push(`question ${loc.question_id}`);
  return parts.join(", ");
}

export function formatIssue(issue: Issue): string {
  const where = formatLocation(issue.location);
  const label = issue.severity.toUpperCase();
  return where
    ? `${label} [${issue.code}] (${where}): ${issue.message}`
    : `${label} [${issue.code}]: ${issue.message}`;
}
