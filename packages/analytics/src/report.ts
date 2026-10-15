/**
 * Trainer report: one row per learner, built only from server-accepted events.
 * The same function feeds the trainer view and the JSON export, so the two can
 * never disagree.
 */

import type { StoredEvent } from "../../contract/src/index.ts";
import type { ContentLibrary } from "./library.ts";
import { computeActiveTime, DEFAULT_ACTIVE_TIME_OPTIONS, type ActiveTimeOptions, type ActiveTimeResult } from "./active-time.ts";
import { findSeqGaps, type SeqGap } from "./order.ts";
import { scoreModule, DEFAULT_THRESHOLDS, type ModuleResult, type Thresholds } from "./scoring.ts";

export interface LearnerInfo {
  learner_id: string;
  name: string;
  username: string;
  cohort_id: string;
}

export interface RejectedSummary {
  event_id: string | null;
  code: string;
  message: string;
  received_at: string;
}

export interface LearnerReport {
  learner: LearnerInfo;
  modules: ModuleResult[];
  time: ActiveTimeResult;
  sync: {
    accepted_events: number;
    last_received_at: string | null;
    rejected_events: number;
    seq_gaps: SeqGap[];
  };
}

export interface ReportOptions {
  thresholds?: Thresholds;
  activeTime?: ActiveTimeOptions;
  /** Modules to report on; default: every module the library knows. */
  moduleIds?: string[];
}

export function buildLearnerReport(
  learner: LearnerInfo,
  events: readonly StoredEvent[],
  rejected: readonly RejectedSummary[],
  library: ContentLibrary,
  options: ReportOptions = {},
): LearnerReport {
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const moduleIds = options.moduleIds ?? library.moduleIds();
  return {
    learner,
    modules: moduleIds.map((id) => scoreModule(id, events, library, thresholds)),
    time: computeActiveTime(events, options.activeTime ?? DEFAULT_ACTIVE_TIME_OPTIONS),
    sync: {
      accepted_events: events.length,
      last_received_at: events.reduce<string | null>((m, e) => (!m || e.received_at > m ? e.received_at : m), null),
      rejected_events: rejected.length,
      seq_gaps: findSeqGaps(events),
    },
  };
}
