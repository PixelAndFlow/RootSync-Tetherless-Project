/**
 * openapi.yaml is written by hand, so nothing stopped it drifting from the
 * contract's TypeScript or from what the server really returns. This compares the
 * facts that can drift: enum values, limits, and the field names of the recorded
 * server responses in fixtures/. It reads the YAML as text (the schemas are
 * written in flow style) so the contract package needs no YAML library.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ATTEMPT_KINDS, EVENT_TYPES, MAX_BODY_BYTES, MAX_EVENTS_PER_BATCH, REJECT_CODES } from "../src/index.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const yaml = readFileSync(here("../openapi.yaml"), "utf8");
const staffApi = readFileSync(here("../src/staff-api.ts"), "utf8");
const indexTs = readFileSync(here("../src/index.ts"), "utf8");
const fixture = (name: string) => JSON.parse(readFileSync(here(`../fixtures/${name}.json`), "utf8"));

/** The text of one entry under components.schemas (4-space indent) up to the next one. */
function schema(name: string): string {
  const start = yaml.indexOf(`\n    ${name}:\n`);
  assert.notEqual(start, -1, `openapi.yaml has no schema ${name}`);
  const rest = yaml.slice(start + 1);
  const next = rest.slice(1).search(/\n    [A-Za-z]+:\n|\n  [a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The list inside `enum: [...]` for a property of a schema. */
function enumOf(block: string, property: string): string[] {
  const at = block.search(new RegExp(`\\n\\s+${property}:`));
  assert.notEqual(at, -1, `no property ${property}`);
  const m = block.slice(at).match(/enum: \[([^\]]*)\]/);
  assert.ok(m, `property ${property} has no enum`);
  return m![1]!.split(",").map((v) => v.trim());
}

/** Property names declared directly under `properties:` of a schema (flow style, one per line). */
function propertyNames(block: string): string[] {
  const at = block.indexOf("properties:");
  assert.notEqual(at, -1, "schema has no properties");
  const names: string[] = [];
  for (const line of block.slice(at).split("\n").slice(1)) {
    const m = line.match(/^ {8}([a-z_0-9]+):/);
    if (m) names.push(m[1]!);
    else if (/^ {0,7}\S/.test(line)) break;
  }
  return names;
}

const sorted = (list: readonly string[]) => [...list].sort();

test("Event.event_type lists exactly the contract's EVENT_TYPES", () => {
  assert.deepEqual(sorted(enumOf(schema("Event"), "event_type")), sorted(EVENT_TYPES));
});

test("EventResult.code lists the contract's REJECT_CODES plus SERVER_BUSY", () => {
  assert.deepEqual(sorted(enumOf(schema("EventResult"), "code")), sorted([...REJECT_CODES, "SERVER_BUSY"]));
});

test("EventResult.status lists the contract's EventStatus values", () => {
  const union = indexTs.match(/export type EventStatus = ([^;]+);/)![1]!;
  const values = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
  assert.deepEqual(sorted(enumOf(schema("EventResult"), "status")), sorted(values));
});

test("the batch limits in openapi.yaml match the contract", () => {
  assert.match(yaml, new RegExp(`events: \\{ type: array, maxItems: ${MAX_EVENTS_PER_BATCH},`));
  assert.match(yaml, new RegExp(`Over ${MAX_BODY_BYTES / 1024} KB or over ${MAX_EVENTS_PER_BATCH} events`));
});

test("the attempt kinds described for attempt_started match ATTEMPT_KINDS", () => {
  assert.ok(yaml.includes(`attempt_kind: ${ATTEMPT_KINDS.join("|")}`));
});

test("Learner.status lists the LearnerStatus values in staff-api.ts", () => {
  const union = staffApi.match(/export type LearnerStatus =([^;]+);/)![1]!;
  const values = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
  assert.deepEqual(sorted(enumOf(schema("Learner"), "status")), sorted(values));
});

test("Learner declares every field the server really returns (recorded responses)", () => {
  const declared = new Set(propertyNames(schema("Learner")));
  const returned = new Set(fixture("learners").learners.flatMap((row: object) => Object.keys(row)));
  assert.deepEqual([...returned].filter((key) => !declared.has(key)), [], "fields the server sends that openapi.yaml does not declare");
});

test("Staff declares every field the server really returns (recorded responses)", () => {
  const declared = new Set(propertyNames(schema("Staff")));
  const returned = new Set(fixture("staff-accounts").accounts.flatMap((row: object) => Object.keys(row)));
  assert.deepEqual([...returned].filter((key) => !declared.has(key)), [], "fields the server sends that openapi.yaml does not declare");
});

test("the Error schema requires exactly the fields the server's errors carry", () => {
  const required = schema("Error").match(/error:\n\s+type: object\n\s+required: \[([^\]]*)\]/)![1]!.split(",").map((v) => v.trim());
  assert.deepEqual(sorted(required), sorted(Object.keys(fixture("error-validation").error)));
});
