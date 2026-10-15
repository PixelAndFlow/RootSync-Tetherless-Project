import type { StoredEvent } from "../../contract/src/index.ts";

/**
 * Put a learner's events in the order they happened.
 *
 * Within one device, device_seq is authoritative (phone clocks can be wrong).
 * Across devices (rare: a replaced phone), devices are interleaved by
 * occurred_at, the only shared clock available.
 */
export function orderEvents<T extends StoredEvent>(events: readonly T[]): T[] {
  const byDevice = new Map<string, T[]>();
  for (const e of events) {
    if (!byDevice.has(e.device_id)) byDevice.set(e.device_id, []);
    byDevice.get(e.device_id)!.push(e);
  }
  const queues = [...byDevice.values()].map((list) => list.sort((a, b) => a.device_seq - b.device_seq));
  const out: T[] = [];
  const idx = queues.map(() => 0);
  for (;;) {
    let pick = -1;
    for (let i = 0; i < queues.length; i++) {
      const e = queues[i]![idx[i]!];
      if (!e) continue;
      if (pick < 0 || Date.parse(e.occurred_at) < Date.parse(queues[pick]![idx[pick]!]!.occurred_at)) pick = i;
    }
    if (pick < 0) return out;
    out.push(queues[pick]![idx[pick]!]!);
    idx[pick]!++;
  }
}

export interface SeqGap {
  device_id: string;
  /** Last sequence number received before the gap (0 when the first events are missing). */
  after_seq: number;
  /** Next sequence number received. */
  before_seq: number;
  missing: number;
}

/** Missing device_seq numbers per device. Flagged for review; never filled in. */
export function findSeqGaps(events: readonly StoredEvent[]): SeqGap[] {
  const byDevice = new Map<string, number[]>();
  for (const e of events) {
    if (!byDevice.has(e.device_id)) byDevice.set(e.device_id, []);
    byDevice.get(e.device_id)!.push(e.device_seq);
  }
  const gaps: SeqGap[] = [];
  for (const [device_id, seqs] of byDevice) {
    const sorted = [...new Set(seqs)].sort((a, b) => a - b);
    let prev = 0;
    for (const s of sorted) {
      if (s - prev > 1) gaps.push({ device_id, after_seq: prev, before_seq: s, missing: s - prev - 1 });
      prev = s;
    }
  }
  return gaps;
}
