# Frontend integration checklist

This checklist keeps the frontend safe to integrate while the DDIL and backend contracts are still being finalized. The current application runs only against typed mock gateways; it does not call a production API.

## Before replacing mock gateways

1. Agree on stable learner, device, module, question, attempt, and event IDs. Once an attempt exists, content IDs must not be renamed.
2. Confirm the event payload for starting, answering, completing, and practicing a mission. Include an event ID, timestamp, device ID, module content version, and a retry/idempotency strategy.
3. Confirm which server response is authoritative when two devices have unsynced work. The interface must be able to show `pending`, `synced`, `conflict`, and `needs attention` without silently overwriting a learner record.
4. Keep learner results and operational data out of browser console output, fixture files, screenshots, and Git commits.
5. Preserve the frontend save rule: `saveAnswer()` resolves only after the DDIL layer has completed its durable local write. Until it resolves, the learner UI must prevent duplicate answer submissions and must not claim the answer is saved.

## Naquan — DDIL/offline boundary

- Preserve the `OfflineLearningGateway` interface. Replace its mock implementation behind `GatewayProvider`; do not scatter IndexedDB, queue, or sync code through screens.
- Define the durable local store, encrypted-at-rest decision, retention/clear-data behavior, sync queue format, retry/backoff, and conflict behavior before enabling a service worker or IndexedDB.
- Return the existing learning-record shapes so first score, current mastery, review, practice, and engagement remain separate concepts.
- Validate offline, reconnect, interrupted write, duplicate event, and full-device-storage behavior on representative devices.

## Marc — backend/API boundary

- Publish an authenticated API contract for content catalog, learner record, trainer aggregates, learner detail, and sync acknowledgement/error states.
- Version content and API payloads. The frontend should receive a clear migration/error response for an unsupported content version.
- Define authorization for learner versus trainer information before real trainer data is connected.
- Provide no-production-data fixtures or a staging tenant for contract and visual testing.

## Frontend acceptance checks

Run these before merging an integration change:

```text
npm run validate:content
npm test
npm run build
npm run test:device
```

Then manually test one complete learner flow, an unknown mission link, an offline/reconnect transition, keyboard-only navigation, display preferences, and trainer empty/filter states.

For answer saving, also confirm that a delayed save disables duplicate answer choices, a rejected save leaves the question available to retry, and success feedback appears only after the gateway resolves.

## Current deliberate non-goals

- no service-worker cache or IndexedDB implementation yet;
- no production authentication, API endpoint, or real learner data;
- no claim that browser viewport simulation certifies native iOS/Android or installed-PWA behavior.
