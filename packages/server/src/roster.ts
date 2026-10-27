/**
 * Roster import (spec v1.10 §9.1): a CSV or .xlsx file of learners, checked
 * first, saved only on commit. Columns are matched by header name, in any
 * order: first_name, last_name, phone, email, training_level, note_1, note_2.
 * "First Name", "first name" and "FIRST_NAME" all match first_name.
 */

import { parseCsv } from "../../content/src/csv.ts";
import { readXlsxFirstSheet } from "../../content/src/xlsx.ts";
import { HttpError, type ErrorDetail } from "./http.ts";
import { checkLearnerFields, LEARNER_FIELD_NAMES } from "./learners.ts";
import type { LearnerFields } from "./store.ts";

export const MAX_ROSTER_BYTES = 2 * 1024 * 1024;
export const MAX_ROSTER_ROWS = 1000;

export interface UploadedFile {
  filename: string;
  data: Buffer;
}

/** Minimal multipart/form-data reader: text fields and one or more files. */
export function parseMultipart(body: Buffer, contentType: string | undefined): { fields: Record<string, string>; files: Record<string, UploadedFile> } {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data") || !m) {
    throw new HttpError(400, "INVALID_INPUT", "Send the roster as multipart/form-data with a 'file' field and a 'cohort_id' field.");
  }
  const boundary = Buffer.from(`--${m[1] ?? m[2]}`);
  const fields: Record<string, string> = {};
  const files: Record<string, UploadedFile> = {};
  let pos = body.indexOf(boundary);
  while (pos >= 0) {
    const start = pos + boundary.length;
    if (body.subarray(start, start + 2).toString() === "--") break;
    const headerEnd = body.indexOf("\r\n\r\n", start);
    if (headerEnd < 0) break;
    const headers = body.subarray(start + 2, headerEnd).toString("utf8");
    const next = body.indexOf(boundary, headerEnd);
    if (next < 0) break;
    const data = body.subarray(headerEnd + 4, next - 2); // drop the CRLF before the boundary
    const name = /name="([^"]*)"/i.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
    if (name) {
      if (filename !== undefined) files[name] = { filename, data: Buffer.from(data) };
      else fields[name] = data.toString("utf8");
    }
    pos = next;
  }
  return { fields, files };
}

const headerKey = (h: string): string => h.trim().toLowerCase().replace(/[\s-]+/g, "_");

function readGrid(file: UploadedFile): string[][] {
  const isXlsx = file.data.subarray(0, 2).toString("latin1") === "PK" || /\.xlsx$/i.test(file.filename);
  if (isXlsx) {
    let grid;
    try {
      grid = readXlsxFirstSheet(file.data);
    } catch (e) {
      throw new HttpError(422, "UNREADABLE_FILE", `This Excel file couldn't be read: ${(e as Error).message}`);
    }
    return grid.map((row) => row.map((c) => (c === null ? "" : String(c))));
  }
  if (!/\.(csv|txt)$/i.test(file.filename) && file.data.includes(0)) {
    throw new HttpError(422, "UNSUPPORTED_FILE", "Upload a .csv or .xlsx file.");
  }
  const parsed = parseCsv(file.data.toString("utf8"));
  if (parsed.unterminatedQuoteAtRow) throw new HttpError(422, "UNREADABLE_FILE", `A quote that starts in row ${parsed.unterminatedQuoteAtRow} is never closed.`);
  return parsed.rows;
}

export interface RosterCheck {
  rows_total: number;
  rows_ok: number;
  errors: ErrorDetail[];
  warnings: ErrorDetail[];
  rows: LearnerFields[];
}

/** Check every row; report every problem with its spreadsheet row number (the header is row 1). */
export function checkRoster(file: UploadedFile): RosterCheck {
  const grid = readGrid(file);
  const header = (grid[0] ?? []).map(headerKey);
  const errors: ErrorDetail[] = [];
  const warnings: ErrorDetail[] = [];
  for (const required of ["first_name", "last_name"]) {
    if (!header.includes(required)) errors.push({ row: 1, field: required, code: "MISSING_COLUMN", message: `The header row needs a ${required} column.` });
  }
  header.forEach((h, i) => {
    if (h && !(LEARNER_FIELD_NAMES as string[]).includes(h)) warnings.push({ row: 1, field: grid[0]![i]!, code: "UNKNOWN_COLUMN", message: `Column "${grid[0]![i]}" isn't used and will be ignored.` });
  });
  if (errors.length) return { rows_total: 0, rows_ok: 0, errors, warnings, rows: [] };

  const rows: LearnerFields[] = [];
  let total = 0;
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!;
    if (cells.every((c) => !c.trim())) continue;
    total++;
    if (total > MAX_ROSTER_ROWS) {
      errors.push({ row: r + 1, code: "TOO_MANY_ROWS", message: `A roster can have at most ${MAX_ROSTER_ROWS} learners.` });
      break;
    }
    const record: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if ((LEARNER_FIELD_NAMES as string[]).includes(h)) record[h] = cells[i] ?? "";
    });
    const { value, errors: rowErrors } = checkLearnerFields(record, { partial: false, row: r + 1 });
    if (rowErrors.length) errors.push(...rowErrors);
    else rows.push(value as LearnerFields);
  }
  if (total === 0) errors.push({ row: 2, code: "EMPTY", message: "The file has a header row but no learners." });
  return { rows_total: total, rows_ok: rows.length, errors, warnings, rows };
}
