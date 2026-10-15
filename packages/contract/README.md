# @tetherless/contract

> **Trial run, 2026-10-15.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

The sync contract shared by the phone and the server: the eight event types,
their validation, the sync request and per-event results, and enrollment
shapes (`src/index.ts`). HTTP endpoints are in `openapi.yaml`.

```sh
node --test "test/**/*.test.ts"
```
