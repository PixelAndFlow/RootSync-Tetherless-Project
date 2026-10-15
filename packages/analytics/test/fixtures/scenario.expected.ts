/**
 * Hand-worked expected results for scenario.ts (thresholds: pass 70, struggling 60,
 * weak topic < 60% with at least 2 answers; idle limit 30 min; max silence 90 s).
 *
 * Topics in pr-bootcamp-security-tools v2:
 *   firewalls q01 q02 · vpn q03 q04 · mfa q05 q06 · iam q07 q08
 *   edr-xdr q09 q10 q11 · password-managers q12 q13 · backups q14 q15
 */

export const EXPECTED = {
  ana: {
    initial: { correct: 12, total: 15, pct: 80 },
    best: { correct: 15, total: 15, pct: 100 },
    latest: { correct: 15, total: 15, pct: 100 },
    first_try: { correct: 12, total: 15, pct: 80 },
    mastery: { correct: 15, total: 15, pct: 100 },
    passed: true,
    struggling_reasons: [] as string[],
    abandoned_before_first_completion: 0,
    completion: "completed",
    // firewalls: q01 ✓✓ q02 ✗✓ = 3/4; edr: q09 ✗✓ q10 ✓✓ q11 ✓✓ = 5/6; backups: q14 ✗✓ q15 ✓✓ = 3/4
    topics: { firewalls: [4, 3], vpn: [4, 4], mfa: [4, 4], iam: [4, 4], "edr-xdr": [6, 5], "password-managers": [4, 4], backups: [4, 3] },
    // visible 0–300 s and 900–1200 s; hidden 300–900 s
    active_ms: 600_000,
    elapsed_ms: 1_200_000,
    flags: [] as string[],
    seq_gaps: 0,
  },
  ben: {
    initial: { correct: 8, total: 15, pct: 53.3 },
    best: { correct: 8, total: 15, pct: 53.3 },
    latest: { correct: 8, total: 15, pct: 53.3 },
    // first answers: q01 ✓ q02 ✗ q03 ✓ (attempt 1), then attempt 2 for the rest -> 8 right
    first_try: { correct: 8, total: 15, pct: 53.3 },
    // ever right: 1,3,4,5,7,10,12,15 (attempt 2) + 2,6,8,9 (practice) = 12; review of q11 doesn't count
    mastery: { correct: 12, total: 15, pct: 80 },
    passed: false,
    struggling_reasons: ["initial_below_threshold", "weak_topic:edr-xdr", "weak_topic:password-managers", "weak_topic:backups"],
    abandoned_before_first_completion: 1,
    completion: "completed",
    // firewalls: A1 q01✓ q02✗, A2 q01✓ q02✗, P q02✓ = 3/5 (60%: not weak)
    // edr: A2 q09✗ q10✓ q11✗, P q09✓ q11✗ = 2/5; pm: A2 q12✓ q13✗, P q13✗ = 1/3; backups: A2 q14✗ q15✓, P q14✗ = 1/3
    topics: { firewalls: [5, 3], vpn: [3, 3], mfa: [3, 2], iam: [3, 2], "edr-xdr": [5, 2], "password-managers": [3, 1], backups: [3, 1] },
    // session 1: visible 0–385 s counted; 385–685 s no signal (flagged); session 2: 0–110 s
    active_ms: 495_000,
    elapsed_ms: 800_000,
    flags: ["no_signal"],
    seq_gaps: 0,
  },
  cara: {
    initial: null,
    best: null,
    latest: null,
    first_try: { correct: 6, total: 8, pct: 75 },
    mastery: { correct: 6, total: 15, pct: 40 },
    passed: null,
    struggling_reasons: [] as string[],
    abandoned_before_first_completion: 0,
    completion: "in_progress",
    // one answer each on mfa (q05 ✗) and backups (q14 ✗): below the 2-answer minimum, so not weak
    topics: { firewalls: [2, 2], vpn: [1, 1], mfa: [1, 0], iam: [1, 1], "edr-xdr": [1, 1], "password-managers": [1, 1], backups: [1, 0] },
    active_ms: 60_000,
    elapsed_ms: 61_000,
    flags: [] as string[],
    seq_gaps: 1,
  },
} as const;
