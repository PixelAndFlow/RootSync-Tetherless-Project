# Frontend integration boundary

## Purpose

**2026-10-22 integration-branch note:** The original ten learner gateway methods
remain unchanged. `SyncStatus` now supports `blocked_auth`. Setup/profile UI uses
an isolated optional mock setup seam; the new cohort-aware reporting adapter is
opt-in and not yet installed in the app. See
[current integration status](FRONTEND_INTEGRATION_STATUS.md) for the implemented
trial API baseline and remaining coordination. The historical undecided-items
list below describes the pre-integration frontend, not an absence of team server
code today.

The learner and trainer screens are ready to receive real adapters without coupling to unfinished DDIL or backend logic. The app currently runs entirely with local mock adapters.

`GatewayProvider` is the one composition point for adapters:

```text
screens and providers
        |
typed gateway hooks
        |
GatewayProvider
        |
mock adapters today / agreed production adapters later
```

## Current behavior

- `MockOfflineLearningGateway` supplies local demo learning, score, mastery, engagement, and sync-status behavior.
- `MockTrainerDataGateway` supplies de-identified trainer fixture data.
- Answer feedback is committed in the UI only after `OfflineLearningGateway.saveAnswer()` resolves; save failures leave the question available for retry.
- No component calls an API, database, IndexedDB, Dexie, service worker, or outbox directly.
- The default adapters remain mocks until the team explicitly supplies replacements at the app boundary.

## Replacement requirements

Naquan's adapter must implement `OfflineLearningGateway`.

Marc's adapter must implement `TrainerDataGateway`.

Once contracts are agreed, compose them in `main.tsx`:

```tsx
<GatewayProvider gateways={{ offlineLearning: ddilGateway, trainerData: apiGateway }}>
  {/* existing application */}
</GatewayProvider>
```

That change must preserve the existing typed method signatures unless the team agrees a versioned contract update.

## Not decided or implemented

- Production API routes, authentication, authorization, and hosting.
- IndexedDB/Dexie schema, service worker caching, outbox mechanics, and real reconnect behavior.
- Event acknowledgement/rejection payload shape and conflict policy.
- Trainer roster/assignment rules and content publishing workflow.

These items must be agreed by the team before production adapters are introduced. Do not add route strings or storage access directly to UI components.
