/**
 * Minimal .xlsx reader (no dependencies) — reads the first worksheet as rows.
 *
 * Why write one: RCO's existing quizzes are Kahoot spreadsheets, and the
 * popular npm package for this (SheetJS "xlsx" 0.18.x) is unmaintained on npm
 * with known security advisories. An .xlsx file is a ZIP of XML files, and we
 * only need cell values from one sheet, so Node's built-in zlib is enough.
 *
 * Supported: shared strings, inline strings, formula string results, numbers,
 * booleans. Not supported (not needed for quiz content): dates, merged cells,
 * styles, multiple sheets.
 */

import { inflateRawSync } from "node:zlib";

export type CellValue = string | number | boolean | null;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  // End of central directory record: signature 0x06054b50, within the last 64 KB.
  const minEocd = Math.max(0, buf.length - 0xffff - 22);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (ZIP directory not found).");

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error("Corrupt .xlsx file (bad ZIP directory entry).");
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    entries.set(name, { name, method, compressedSize, localHeaderOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipFile(buf: Buffer, entry: ZipEntry): string {
  const p = entry.localHeaderOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`Corrupt .xlsx file (bad header for ${entry.name}).`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`Unsupported compression in .xlsx file (method ${entry.method}).`);
}

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, ent: string) => {
    switch (ent) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return String.fromCodePoint(
          ent.startsWith("#x") ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10),
        );
    }
  });
}

/** Concatenate every <t> run inside a string item, skipping phonetic hints (<rPh>). */
function textOfStringItem(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) {
    out += decodeXml(m[1] ?? "");
  }
  return out;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function firstSheetPath(files: Map<string, ZipEntry>, buf: Buffer): string {
  const workbook = files.get("xl/workbook.xml");
  const rels = files.get("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const wbXml = readZipFile(buf, workbook);
    const relId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wbXml)?.[1];
    if (relId) {
      const relXml = readZipFile(buf, rels);
      for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
        const tag = m[0];
        if (tag.includes(`Id="${relId}"`)) {
          const target = /Target="([^"]+)"/.exec(tag)?.[1];
          if (target) return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
        }
      }
    }
  }
  if (files.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  throw new Error("No worksheet found in .xlsx file.");
}

/** Read the first worksheet into a grid of rows. Empty cells are null. */
export function readXlsxFirstSheet(buf: Buffer): CellValue[][] {
  const files = readZipEntries(buf);

  const shared: string[] = [];
  const sst = files.get("xl/sharedStrings.xml");
  if (sst) {
    const xml = readZipFile(buf, sst);
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(textOfStringItem(m[1] ?? ""));
  }

  const sheetPath = firstSheetPath(files, buf);
  const sheetEntry = files.get(sheetPath);
  if (!sheetEntry) throw new Error(`Worksheet ${sheetPath} is missing from the .xlsx file.`);
  const xml = readZipFile(buf, sheetEntry);

  const rows: CellValue[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attrs = rowMatch[1] ?? rowMatch[3] ?? "";
    const rowNum = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? rows.length + 1);
    const cells: CellValue[] = [];
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cAttrs = c[1] ?? "";
      const inner = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(cAttrs)?.[1];
      const col = ref ? columnIndex(ref) : cells.length;
      const type = /\bt="([^"]+)"/.exec(cAttrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: CellValue = null;
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOfStringItem(inner);
      else if (type === "str" && v !== undefined) value = decodeXml(v);
      else if (type === "b" && v !== undefined) value = v === "1";
      else if (v !== undefined) value = Number(v);
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    while (rows.length < rowNum - 1) rows.push([]);
    rows[rowNum - 1] = cells;
  }
  return rows;
}
