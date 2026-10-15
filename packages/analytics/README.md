# @tetherless/analytics

> **Trial run, 2026-10-15.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

Scores, active time and the trainer report, calculated only from events the
server accepted and the published answer keys.

- `scoreModule`: initial, best and latest full-attempt scores; first-try
  accuracy; mastery; abandoned attempts; weak topics; pass (≥ 70%) and
  struggling (< 60%) flags. Thresholds are settings.
- `computeActiveTime`: time while the app is visible, measured with the
  monotonic clock, stopping after 30 minutes without interaction and at any
  gap with no heartbeat (frozen or killed app). Gaps are flagged.
- `buildLearnerReport`: one learner's report; feeds both the trainer view and
  the JSON export.

`test/fixtures/scenario.ts` is a fixed three-learner dataset with hand-worked
expected results in `scenario.expected.ts`. The server tests sync the same
dataset over HTTP and check the report against the same numbers.

```sh
node --test "test/**/*.test.ts"
```
