# @tetherless/contract

> **Trial run, updated 2026-10-21 to spec v1.10.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

The sync contract shared by the phone and the server: the eight event types,
their validation, the sync request and per-event results, the setup request
and username rules (`src/index.ts`). Answer events may carry what the phone
showed (`local_is_correct`, `local_correct`/`local_total`); the server stores
those but always scores from the raw answers. HTTP endpoints are in `openapi.yaml`.

```sh
node --test "test/**/*.test.ts"
```
