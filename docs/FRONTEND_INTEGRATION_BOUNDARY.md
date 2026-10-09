# Frontend integration boundary

## Purpose

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
