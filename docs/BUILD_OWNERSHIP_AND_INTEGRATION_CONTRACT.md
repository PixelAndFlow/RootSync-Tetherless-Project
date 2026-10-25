# Build Ownership and Integration Contract

## Purpose

This proposed working contract divides the Tetherless P0 build into three primary workstreams so the team can work in parallel without duplicating production architecture. It complements the PRD and technical contracts; it does not replace RCO product decisions or a later team-approved API specification.

**Status:** Proposed for team confirmation on 2026-10-11. It becomes the active working agreement only after Chris, Naquan, and Marc confirm it.

## Ownership model

| Workstream | Primary owner | Accountable deliverable |
| --- | --- | --- |
| Frontend learner and trainer experience | Chris | React UI, frontend gateway contracts, integration composition, and frontend acceptance tests |
| DDIL and offline persistence | Naquan | Production `OfflineLearningGateway` with durable local storage, resume, and outbox behavior |
| Backend, API, and reporting | Marc | Authenticated, idempotent event API, server storage, reporting APIs, and backend test environment |

Each workstream owner owns implementation, unit tests, technical documentation, and defect correction within that workstream. File count is not the measure of ownership; acceptance criteria and operational behavior are.

## 1. Chris - frontend ownership

Chris owns what learners and trainers see and interact with:

- learner onboarding, mission library, training, remediation, review, results, and trainer screens;
- mobile responsiveness, accessibility, RCO branding, Spanish Assist, and content rendering;
- learner-facing offline and sync-status presentation;
- typed gateway interfaces and mocks used by UI development;
- `GatewayProvider` composition and frontend integration testing;
- frontend handling for loading, save failures, pending activity, acknowledgement, rejection, and empty/error states.

Chris does not own production IndexedDB/Dexie implementation, outbox internals, retry/backoff logic, backend routes, server database design, server authentication, backend authorization, or deployment infrastructure.

## 2. Naquan - DDIL and offline ownership

Naquan owns the production DDIL implementation behind `OfflineLearningGateway`:

- Dexie/IndexedDB schema, migrations, and local-data retention/clear-data policy;
- atomic local-first writes for learner actions;
- stable event-ID creation and durable pending-event outbox records;
- attempt, submitted-answer, progress, and resume/cursor persistence;
- retry, batching, reconnect behavior, acknowledgement processing, and local event delivery states;
- quota, interrupted-write, offline, restart, duplicate-event, and multi-day persistence tests;
- the DDIL adapter documentation and its integration instructions.

Naquan does not own React screens, visual state/layout, trainer dashboard presentation, API/database implementation, server-side idempotency, or final backend authorization rules.

## 3. Marc - backend and reporting ownership

Marc owns the production backend and its operational data contract:

- versioned, authenticated event-ingestion API;
- server-side event validation and idempotency/deduplication keyed by stable event ID;
- explicit acknowledgement, retryable error, rejection, and conflict response formats;
- server database schema, migrations, secure storage, and observability appropriate to the project;
- learner record, content catalog, trainer aggregate, and trainer learner-detail APIs;
- learner-versus-trainer authorization rules;
- a local or staging test environment, safe fixtures, API documentation, and backend tests.

Marc does not own IndexedDB schema, browser outbox/retry mechanics, React components, frontend visual behavior, or DDIL resume implementation.

## Shared work - intentionally limited

Shared work is limited to decisions that affect more than one workstream:

- approve a versioned learner-event contract and any contract changes;
- decide product behavior that cannot be inferred safely, including score versus mastery, restart policy, conflicts, retention, privacy, and active-time policy;
- review cross-layer pull requests and resolve integration defects;
- run agreed end-to-end acceptance tests on a safe test environment.

As a planning guide, keep this shared lane to roughly 10-15% of remaining team effort. It is for decisions, reviews, integration, and testing - not for silently transferring another owner's implementation work to Chris.

## Required handoffs

| From | Handoff to the team | Acceptance evidence |
| --- | --- | --- |
| Chris | Stable gateway interface, mock scenarios, UI states, and frontend acceptance expectations | Frontend tests pass; UI contains no direct storage or API access |
| Naquan | Versioned DDIL adapter and schema/migration notes | Answer survives restart; existing attempt resumes without duplication; pending event remains pending until acknowledgement |
| Marc | Versioned API specification, sample responses, and test environment | Repeated delivery of one event ID creates one server record and returns a deterministic acknowledgement/result |

## Integration and merge rules

1. Agree and version shared event/API contracts before implementing cross-layer behavior. Contract changes require review from Chris, Naquan, and Marc.
2. Work independently in focused branches or repositories. Do not maintain one long-lived integration branch that collects unreviewed changes.
3. Merge contract/type changes first, separately from implementation.
4. Naquan may merge the DDIL adapter after local persistence and resume tests pass; it does not need a finished backend to do this.
5. Marc may build and test backend endpoints from the versioned contract without waiting for additional frontend screens.
6. Connect real sync only when the DDIL outbox and backend endpoint pass the same contract tests.
7. Merge integration changes only when the applicable owner supplies tests and the team passes the shared acceptance scenario.

## Boundaries that must not be bypassed

- React components must not call IndexedDB, Dexie, storage tables, queue code, API routes, or database code directly.
- The DDIL layer must not make frontend layout or user-flow decisions.
- The backend must not depend on frontend component state or browser storage details.
- A pending event is not synced merely because the device is online; it is synced only after the agreed backend acknowledgement.
- No owner should implement another owner’s production layer unless the team records an explicit reassignment and updates workload expectations.

## Completion criteria for the integrated P0

The P0 is ready for joint acceptance when one learner can complete a module offline, close and reopen the app without losing committed work or creating a duplicate attempt, retain pending activity locally, synchronize each event exactly once after connectivity returns, and make the agreed trainer result available through authorized backend data. The learner-facing UI must accurately distinguish local save from backend acknowledgement.

## Change-control record

For every decision that crosses the three workstreams, record:

- date and version;
- decision and rationale;
- owners who approved it;
- affected contract/interface;
- migration or compatibility plan;
- tests required before merge.
