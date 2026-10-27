import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, looksMisencoded, splitBilingual } from "../src/text.ts";
import { detectDelimiter, parseCsv } from "../src/csv.ts";
import { decodeXml } from "../src/xlsx.ts";

test("cleanText converts macOS-style decomposed accents (NFD) to NFC", () => {
  const nfd = "Que\u0301 es".normalize("NFD");
  assert.notEqual(nfd, "Qué es");
  assert.equal(cleanText(nfd), "Qué es");
});

test("cleanText strips BOM, trims, and unifies line endings", () => {
  assert.equal(cleanText("\uFEFF  hola\r\nmundo  "), "hola\nmundo");
  assert.equal(cleanText(null), "");
  assert.equal(cleanText(60), "60");
});

test("looksMisencoded catches UTF-8 read as Windows-1252", () => {
  assert.equal(looksMisencoded("Â¿QuÃ© es?"), true);
  assert.equal(looksMisencoded("â€œquotedâ€\u009d"), true);
  assert.equal(looksMisencoded("¿Qué es? ñ ü ¡Sí!"), false);
});

test("splitBilingual splits on ' / ' only, Spanish first by default", () => {
  assert.deepEqual(splitBilingual("¿Qué es? / What is it?"), { en: "What is it?", es: "¿Qué es?", bilingual: true, ambiguous: false });
  assert.deepEqual(splitBilingual("What / Qué", "en-es"), { en: "What", es: "Qué", bilingual: true, ambiguous: false });
});

test("splitBilingual leaves EDR/XDR and TCP/IP intact", () => {
  assert.deepEqual(splitBilingual("EDR/XDR"), { en: "EDR/XDR", bilingual: false, ambiguous: false });
  const r = splitBilingual("¿Cómo evoluciona el EDR/XDR? / How does EDR/XDR evolve?");
  assert.equal(r.en, "How does EDR/XDR evolve?");
  assert.equal(r.es, "¿Cómo evoluciona el EDR/XDR?");
});

test("splitBilingual flags more than one separator as ambiguous", () => {
  const r = splitBilingual("a / b / c");
  assert.equal(r.ambiguous, true);
  assert.equal(r.es, undefined);
});

test("parseCsv handles quotes, escaped quotes, embedded commas and newlines", () => {
  const { rows } = parseCsv('a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x, y", 'he said "hi"', "line1\nline2"],
  ]);
});

test("parseCsv detects semicolons (Excel in Spanish locales) and strips BOM", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const { rows, delimiter } = parseCsv("\uFEFFa;b\n1,5;2");
  assert.equal(delimiter, ";");
  assert.deepEqual(rows, [["a", "b"], ["1,5", "2"]]);
});

test("parseCsv reports an unclosed quote with its record number", () => {
  const r = parseCsv('a,b\n1,2\n"oops,3\n4,5');
  assert.equal(r.unterminatedQuoteAtRow, 3);
});

test("decodeXml handles named and numeric entities", () => {
  assert.equal(decodeXml("&lt;b&gt; &amp; &quot;x&quot; &#191;Qu&#xE9;?"), '<b> & "x" ¿Qué?');
});
