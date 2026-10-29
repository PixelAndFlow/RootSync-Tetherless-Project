# Tetherless Frontend Build Handoff for Codex

Version: Frontend start handoff — October 8, 2026  
Owner for this workstream: Chris / RootSync  
Client: Raíces Cyber Organization (RCO)  
Product: Tetherless  
Status: Safe to begin frontend work before the team PRD is finalized

## 1. Purpose of this document

This document is the working contract for starting the Tetherless frontend locally in VS Code with Codex.

The goal is to let frontend work begin immediately without waiting for the final team PRD, while keeping the frontend compatible with:

- RCO's confirmed requirements and curriculum;
- Naquan's offline/DDIL persistence and synchronization layer;
- the future backend/API and PostgreSQL database;
- a later trainer dashboard;
- the current Tetherless JSON/CSV content direction;
- the current RCO branding and bilingual content direction.

This is not permission to invent new product requirements. Where a requirement is not confirmed by RCO, this document labels it as a RootSync proposal or an implementation assumption.

## 2. Hard working rules for Codex

For this phase:

- Work only inside the local project directory provided by Chris.
- Do not clone, fetch, pull, push, inspect, modify, or otherwise interact with any GitHub repository or remote.
- Do not use the GitHub CLI or GitHub API.
- Do not create or change a git remote.
- Do not deploy anything yet.
- Do not connect to production services.
- Do not make live API calls unless Chris explicitly asks.
- Do not implement a competing production offline/sync architecture. The production DDIL layer belongs behind the interface described in this document and will integrate with Naquan's work.
- Keep all backend dependencies behind typed interfaces so the frontend can run using fixtures/mocks.
- Prefer small, testable components and explicit TypeScript types.
- Do not silently change the shared content/event contracts.
- If a requirement in this document conflicts with an RCO source file, stop and surface the conflict to Chris.

Local git may be used only if Chris explicitly asks for it. The important restriction is zero remote/GitHub interaction during this phase.

## 3. Product in one sentence

Tetherless is an offline-first, phone-focused cybersecurity learning companion that lets RCO learners practice at home without reliable internet, preserves progress locally, and later synchronizes structured learning records so trainers can evaluate participation, accuracy, improvement, and weak topics.

Five-word shorthand:

Offline learning. Progress saved. Syncs.

## 4. Confirmed / strongly supported RCO context

Treat these as the current product basis:

- Tetherless supplements instructor-led RCO training; it does not replace the classroom program.
- Personal phones are the primary learner device.
- The important environment is disconnected, disrupted, intermittent, or limited connectivity.
- One primary phone per learner is the current MVP boundary.
- Learner setup should use name + username; the app should maintain an internal stable learner/install identifier behind the scenes.
- RCO owns and creates the curriculum. RootSync builds the delivery platform.
- RCO has supplied real cybersecurity curriculum and multiple-choice/Kahoot-style material.
- The first polished activity can be a 15-question multiple-choice module.
- RCO source material is bilingual in relevant samples; English cyber terminology remains important.
- Poppins is the confirmed brand font.
- RCO supplied current logo assets.
- Older/lower-resource phones are real targets. The provisional floor is iOS 16.4+ and Android 10+, with roughly 2–3 GB RAM-class devices and limited storage.
- No at-home countdown timer is required.
- Trainer visibility is required. The trainer should be able to see proof of completion and useful learning metrics.
- RCO is comfortable with JSON for content/data work. CSV should also be supported as an authoring/import option.
- PostgreSQL is acceptable as the central database.
- Lightweight self-hosting / Docker Compose is a good eventual RCO deployment direction.
- AI is not the source of truth for scoring or data integrity. Treat AI as stretch/optional.
- Systeme.io/Zapier is not a dependency for the frontend MVP.
- Dark mode is required; a black/purple/cyan cyber visual direction is appropriate.
- The app should remain simple, low-cost, and maintainable.

## 5. RootSync product proposals that are not the same as client-confirmed requirements

These are approved working directions for frontend prototyping, but keep them configurable and easy to change after RCO review:

- Cyber Mission framing instead of plain "quiz" framing.
- Mission sectors/checkpoints.
- XP as an engagement reward.
- Cyber Shield as a visual representation of current mastery.
- Streaks.
- Badges.
- "Recruit → Analyst → Incident Responder" progression language.
- Kahoot-inspired colorful answer cards.
- Spanish Assist: English stays primary, with reviewed Spanish displayed underneath.
- Dedicated remediation flow for missed questions.
- Dedicated read-only review of correct answers.
- A trainer dashboard visual design.

Important: XP, badges, streaks, and Cyber Shield must never alter the academic score.

## 6. Frontend ownership boundary

Chris's frontend workstream should own everything the learner or trainer sees.

Frontend responsibilities:

- learner onboarding screens;
- mission/module library;
- module download/availability UI;
- training question renderer;
- RCO branding;
- dark responsive mobile layout;
- Spanish Assist;
- progress indicators;
- gamification presentation;
- immediate local correctness feedback;
- result/debrief screens;
- missed-question practice UI;
- correct/incorrect/full review UI;
- sync/offline status presentation;
- trainer dashboard presentation;
- report/export controls when backend support exists;
- typed adapters/interfaces to the offline and backend layers.

Frontend should not directly own:

- production IndexedDB schema implementation;
- production event queue internals;
- retry/backoff implementation;
- server-side idempotency;
- PostgreSQL schema;
- backend authentication implementation;
- final production deployment.

## 7. High-level architecture

Use this conceptual boundary:

```text
React / TypeScript UI
        |
        v
Frontend service interfaces
        |
        +--------------------+
        |                    |
        v                    v
Offline/DDIL Gateway      Trainer/API Gateway
(Naquan's layer)          (backend later)
        |                    |
        v                    v
IndexedDB + Queue         API / PostgreSQL
```

The React components must not know the details of Dexie, retry queues, database tables, or backend implementation.

## 8. Naquan's current offline/DDIL integration proposal

Naquan described the offline layer as a transparent persistence proxy between UI state and the API client.

Current direction:

1. A user action is captured locally first.
2. A uniform event/payload is written to IndexedDB.
3. Mutating actions enter an append-only pending sync queue.
4. The UI updates optimistically from local state.
5. When connectivity returns, pending events are batched.
6. The frontend/offline layer sends them to:

```text
POST /api/v1/sync
```

7. Each event has a client UUID and client timestamp.
8. Backend processing must be idempotent.
9. Backend returns a per-event result/acknowledgement.
10. Only acknowledged events are marked synced.

Naquan's initial conceptual record was similar to:

```ts
{
  id,
  actionType,
  payload,
  timestamp,
  status: "pending" | "synced"
}
```

For team consistency, frontend should use the normalized contract below rather than inventing a second shape.

## 9. Normalized shared event contract for frontend integration

Use this as the working TypeScript direction:

```ts
export type SyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "retryable_error"
  | "rejected";

export interface TetherlessEvent<TPayload = unknown> {
  event_id: string;
  schema_version: number;

  learner_id: string;
  device_id: string;

  module_id: string;
  content_version: string;

  attempt_id?: string;
  question_id?: string;

  event_type:
    | "session_started"
    | "session_ended"
    | "app_backgrounded"
    | "app_returned"
    | "module_opened"
    | "question_answered"
    | "question_checked"
    | "module_completed"
    | "remediation_started"
    | "remediation_answered"
    | "remediation_completed"
    | "full_retry_started"
    | "full_retry_completed";

  payload: TPayload;
  client_timestamp: string;
  status: SyncStatus;
}
```

Not every event requires `question_id` or `attempt_id`.

Do not use last-write-wins as the default learning-record model. Most learning events should be append-only historical facts. Duplicate upload of the same `event_id` must be safe.

## 10. Expected sync acknowledgement shape

The frontend can type against a response similar to:

```ts
export type SyncResultStatus =
  | "accepted"
  | "duplicate"
  | "retryable_error"
  | "rejected";

export interface SyncEventResult {
  event_id: string;
  status: SyncResultStatus;
  reason?: string;
}

export interface SyncBatchResponse {
  results: SyncEventResult[];
  server_timestamp: string;
}
```

Frontend behavior:

- `accepted` → may mark event synced.
- `duplicate` → may also mark event synced because server already has it.
- `retryable_error` → keep local and retry later.
- `rejected` → keep enough information for diagnosis; do not silently delete.
- connection loss before acknowledgement → event stays pending.

Do not rely only on `window.online` or Background Sync.

Future sync triggers should include:

- app start;
- app resume;
- browser online event;
- manual Sync action;
- safe automatic retry when the app is active and connectivity is available.

## 11. Frontend gateway interface

Create a typed interface now so UI development does not wait for Naquan's production implementation.

Recommended working interface:

```ts
export interface OfflineLearningGateway {
  startSession(input: StartSessionInput): Promise<SessionRecord>;

  startAttempt(input: StartAttemptInput): Promise<AttemptRecord>;

  saveAnswer(input: SaveAnswerInput): Promise<void>;

  completeAttempt(input: CompleteAttemptInput): Promise<AttemptRecord>;

  startRemediation(input: StartRemediationInput): Promise<AttemptRecord>;

  getModuleProgress(
    learnerId: string,
    moduleId: string
  ): Promise<ModuleProgress>;

  getLearnerModuleRecord(
    learnerId: string,
    moduleId: string
  ): Promise<LearnerModuleRecord | null>;

  getSyncSummary(): Promise<SyncSummary>;

  requestSync(): Promise<SyncSummary>;

  subscribeToSyncStatus(
    callback: (summary: SyncSummary) => void
  ): () => void;
}
```

For local frontend development, implement a temporary adapter behind this interface.

Allowed for the temporary frontend adapter:

- in-memory state;
- localStorage;
- simple fixture persistence.

Do not present the temporary adapter as the production DDIL implementation.

It must be easy to replace with Naquan's IndexedDB/Dexie implementation without rewriting React components.

## 12. Trainer/API gateway interface

The trainer dashboard should also depend on a typed interface, not direct fetch calls scattered across components.

Example:

```ts
export interface TrainerDataGateway {
  listLearners(): Promise<TrainerLearnerSummary[]>;

  getLearnerModuleDetail(
    learnerId: string,
    moduleId: string
  ): Promise<TrainerModuleDetail>;

  getModuleCohortSummary(
    moduleId: string
  ): Promise<ModuleCohortSummary>;
}
```

Use fixture data for now.

Do not hard-wire Neon, Render, Rails, Node, or any other backend detail into React components.

## 13. Learner module content model

Runtime direction:

- RCO may author/import JSON or CSV.
- Both should normalize into one internal Tetherless module object.
- Do not build a separate JSON quiz engine and CSV quiz engine.
- JSON is the full-fidelity format for nested/gamified modules.
- CSV is the simpler spreadsheet-friendly input for conventional questions.
- Runtime frontend consumes the normalized JSON model.

Use the existing generated gamified sample as a development fixture:

```text
RCO_Tetherless_Beginner_Gamified_Module_v2.json
```

Recommended local path:

```text
src/content/fixtures/operation-cyber-squad.json
```

Core fields to preserve:

```ts
interface LocalizedText {
  en: string;
  es?: string;
}

interface Choice {
  id: string;
  en: string;
  es?: string;
  icon?: string;
}

interface Question {
  id: string;
  topic: string;
  type: string;
  presentation: string;

  prompt: LocalizedText;
  scenario?: LocalizedText;

  choices: Choice[];
  correct_choice: string;
  feedback: LocalizedText;
}

interface TetherlessModule {
  schema_version: string;
  module_id: string;
  content_version: string;

  program: string;
  level: string;

  title: LocalizedText;
  subtitle?: LocalizedText;
  mission_brief?: LocalizedText;

  settings: Record<string, unknown>;
  gamification?: Record<string, unknown>;

  questions: Question[];
}
```

Validation should eventually reject:

- duplicate question IDs;
- missing correct choices;
- correct choice not present in choices;
- duplicate module IDs used incorrectly;
- missing content version;
- referenced missing assets.

## 14. First frontend module to build

Use the beginner prototype already developed:

Mission name:

```text
Operation Cyber Squad
```

Learner level:

```text
Recruit
```

Current module concept:

- 15 questions;
- roles and teams;
- ethics and authorization;
- basic Git/version-control concepts;
- no timer;
- immediate feedback;
- English primary;
- Spanish Assist underneath;
- three mission sectors plus final challenge;
- XP, streak, Cyber Shield, badge presentation;
- academic score and engagement rewards kept separate.

Current sector direction:

```text
Sector 1 — Know Your Team
Sector 2 — Stay Inside the Rules
Sector 3 — Protect the Evidence
Final Challenge
```

The exact labels are RootSync UX proposals and should be centralized in module/config data so they can change without rewriting components.

## 15. Learner experience flow

Build the frontend to support this path:

```text
Welcome / learner setup
        |
        v
Mission library
        |
        v
Mission detail
        |
        v
Download / Available Offline status
        |
        v
Start Mission
        |
        v
15-question module
        |
        v
Mission Debrief
        |
        +----------------------------+
        |             |              |
        v             v              v
Practice missed   Review correct   Try all again
        |
        v
Updated mastery
```

Also support secondary review:

- review initially missed answers;
- review all answers.

## 16. Question presentation

Keep question logic separate from visual presentation.

Examples:

```text
question type = multiple_choice
presentation = kahoot_cards
```

```text
question type = scenario_mc
presentation = mission_alert
```

Initial presentation tokens that may appear in sample content:

- kahoot_cards
- mission_alert
- security_alert
- policy_card
- code_card
- evidence_diff
- boss_question
- image_choice

Do not implement separate scoring rules merely because the presentation changes.

## 17. Spanish Assist

Working UX:

OFF:

```text
English only
```

ON:

```text
English primary
Spanish directly underneath in smaller/lower-emphasis text
```

Rules:

- English cyber terminology remains visible.
- Spanish must never replace the English source value in application state.
- Store/use separate language fields.
- Preference should be represented in frontend state and later persisted locally.
- Do not use live Google translation or any network translation dependency.
- Current Spanish text is source/review content, not dynamically generated at runtime.
- Avoid malformed or mojibake characters.
- Formal Spanish opening punctuation can be revisited with RCO; do not introduce encoding hacks merely to hide valid Unicode.

## 18. Scoring, completion, mastery, and remediation

These are separate concepts.

Completion:

```text
All required questions have been answered.
```

Initial score:

```text
First completed full attempt.
Example: 10 / 15 = 66.7%
```

Current mastery:

```text
How many module concepts/questions have eventually been answered correctly through the original attempt and remediation.
Example: 14 / 15 = 93.3%
```

Critical rule:

Never overwrite the learner's initial score when remediation improves mastery.

Example record:

```text
Initial score: 66.7%
Missed-question practice: 4 of 5 corrected
Current mastery: 93.3%
```

Full retries should create additional attempt history rather than erase prior attempts.

Read-only review should not change:

- score;
- mastery;
- XP;
- answer history.

## 19. End-of-module learner actions

At the end of every completed training module, provide these primary actions:

1. Practice missed questions
   - redo only still-unmastered questions;
   - preserve original score;
   - update mastery if corrected.

2. Review correct answers
   - read-only;
   - show chosen answer;
   - show why it is correct;
   - show Spanish Assist if enabled;
   - no score/mastery mutation.

3. Try all questions again
   - new full attempt;
   - preserve history.

Secondary actions:

- review initially missed answers;
- review all answers.

If there are no missed questions, disable/hide remediation appropriately.

## 20. Gamification rules

Gamification should remain lightweight and offline-friendly.

Allowed MVP/prototype mechanics:

- mission framing;
- sector/checkpoint progress;
- XP;
- streak;
- Cyber Shield;
- badge;
- final challenge;
- sector completion screen.

Do not include for now:

- lives/hearts that punish mistakes;
- real-time multiplayer;
- live leaderboard;
- question countdown timer;
- video-heavy rewards;
- reward logic that requires a live server.

XP rules:

- XP is motivational only.
- XP does not alter academic grade.
- Avoid infinite farming of the same mastered question.
- Prefer one-time XP for first mastery of a concept.
- Sector and mission bonuses may be used visually.

## 21. Trainer dashboard requirements

The trainer UI should eventually present synchronized server data.

For local frontend work, use fixtures.

Minimum useful module-level learner fields:

- learner identity/display name;
- module;
- content version;
- completion status;
- first started time;
- completion time;
- questions total;
- questions answered;
- initial correct count;
- initial score percentage;
- questions missed initially;
- current mastered count;
- current mastery percentage;
- still-unmastered count;
- remediation questions attempted;
- remediation questions corrected;
- full attempt count;
- remediation round count;
- active engagement time;
- elapsed time if available;
- session count;
- leave/return count;
- best streak;
- XP as an engagement signal;
- sync status;
- topic performance;
- sector performance;
- question-level history.

Important:

XP must be visually and semantically separated from the learner's academic score.

Suggested dashboard table columns:

```text
Learner
Module
Complete
Initial
Mastery
Answered
Missed → Still Unmastered
Active Time
Sessions
XP
Best Streak
Sync
```

Suggested detail view:

```text
Initial Attempt
10 / 15 = 66.7%

Remediation
5 attempted
4 corrected

Current Mastery
14 / 15 = 93.3%

Engagement
Active: 11m 04s
Sessions: 2
Returns: 1

Weak Topics
Authorization
Ethics
Version Control
```

## 22. Active engagement time

Frontend should be capable of displaying and emitting lifecycle events needed for active-time calculation.

Working rule:

- count active time while Tetherless is visible/foreground and learner activity has not exceeded an inactivity threshold;
- pause while the app is backgrounded;
- a long inactivity gap should not count as continuous studying;
- emit app background/return/session events through the gateway.

Do not hard-code an RCO policy threshold deep inside components.

Make an inactivity threshold configurable.

## 23. Sync/offline status UX

The learner should understand whether work is safe locally and whether RCO has received it.

Recommended states:

```text
Offline
Saved locally
Waiting to sync
Syncing
Synced
Sync failed — retry available
```

Do not expose backend IDs or technical queue details to learners.

A manual Sync control should be supported by the UI contract even if the initial local frontend uses a mock implementation.

## 24. Module download and local storage UX

Current design direction:

- learner downloads/opens assigned or selected modules while connected;
- module JSON and assets become available offline;
- learner can see "Available Offline";
- learner records and pending sync events must never be deleted automatically merely to clear content storage;
- if storage is low, suggest removal of old completed module content only;
- never silently delete unsynced learner activity.

The browser cannot reliably report exact total free phone disk space.

Future UI may use approximate origin storage information and app-owned module-size metadata.

## 25. Branding

Use the actual RCO assets provided to the team.

Preferred small-header logo for the current prototype:

```text
rc_color.svg
```

Keep the second current logo available for larger/splash contexts:

```text
rc_split_color.svg
```

Do not redraw or approximate the logo.

Working visual direction:

- Poppins;
- dark mode;
- black/navy base;
- purple / magenta / cyan cyber accents;
- high contrast;
- large touch targets;
- readable on older/smaller phones;
- avoid excessive animation.

Current working palette used in prototypes:

```text
#5a1ee4
#c143c0
#ae08f2
#041942
#FFDE59
#10ED3E
```

Treat exact color-token naming as a frontend design-system choice.

## 26. Suggested frontend stack

Use:

```text
React
TypeScript
Vite
Tailwind CSS
React Router
Vitest
React Testing Library
```

PWA support may be scaffolded locally, but do not deploy yet.

Do not make Capacitor part of this initial build.

Capacitor remains a future fallback if real-device PWA/IndexedDB durability testing fails or RCO later requires native-store packaging.

## 27. Suggested local folder structure

A starting shape:

```text
tetherless/
├─ docs/
│  ├─ CODEX_FRONTEND_HANDOFF.md
│  ├─ project/
│  ├─ rco-source-private/
│  └─ ux-reference/
│
├─ public/
│  └─ brand/
│     ├─ rc_color.svg
│     └─ rc_split_color.svg
│
├─ src/
│  ├─ app/
│  │  ├─ routes/
│  │  └─ providers/
│  │
│  ├─ components/
│  │  ├─ common/
│  │  ├─ learner/
│  │  ├─ trainer/
│  │  └─ gamification/
│  │
│  ├─ features/
│  │  ├─ onboarding/
│  │  ├─ missions/
│  │  ├─ training/
│  │  ├─ remediation/
│  │  ├─ review/
│  │  ├─ results/
│  │  ├─ sync-status/
│  │  └─ trainer-dashboard/
│  │
│  ├─ content/
│  │  ├─ schema/
│  │  └─ fixtures/
│  │     └─ operation-cyber-squad.json
│  │
│  ├─ services/
│  │  ├─ offline/
│  │  │  ├─ OfflineLearningGateway.ts
│  │  │  └─ MockOfflineLearningGateway.ts
│  │  └─ trainer/
│  │     ├─ TrainerDataGateway.ts
│  │     └─ MockTrainerDataGateway.ts
│  │
│  ├─ types/
│  ├─ utils/
│  ├─ styles/
│  └─ tests/
│
└─ package.json
```

Do not treat this structure as immutable. Preserve separation of UI from offline/backend internals.

## 28. Recommended routes

For local development:

```text
/
#/learner
#/learner/missions
#/learner/missions/:moduleId
#/learner/missions/:moduleId/play
#/learner/missions/:moduleId/results
#/learner/missions/:moduleId/review
#/trainer
#/trainer/learners/:learnerId
```

Hash-based routing is acceptable for future static hosting such as GitHub Pages, but no GitHub Pages deployment should be configured during this local-only phase unless Chris explicitly asks.

## 29. Frontend implementation sequence

Build vertically, not as one giant UI project.

Phase 1 — foundation

- Create React + TypeScript + Vite app.
- Add Tailwind.
- Add routes.
- Add theme tokens.
- Add official RCO logo assets.
- Add typed content model.
- Load the gamified JSON fixture.
- Render mission detail.

Phase 2 — learner mission

- Render 15 questions.
- Render Kahoot-inspired answer cards.
- Spanish Assist toggle.
- Immediate deterministic correctness feedback.
- Progress bar and sector progress.
- Mobile responsiveness.

Phase 3 — results and learning logic

- Preserve first attempt.
- Calculate initial score.
- Calculate current mastery.
- Practice missed questions.
- Review correct answers.
- Review missed answers.
- Review all.
- Full retry.
- Preserve attempt history in temporary gateway.

Phase 4 — gamification presentation

- XP.
- streak.
- Cyber Shield.
- sector completion.
- badge.
- final challenge.
- Keep academic score separate.

Phase 5 — trainer frontend

- Trainer overview.
- learner/module detail.
- topic and sector performance.
- attempt history.
- active time/session metrics.
- question-level history.
- use fixture gateway.

Phase 6 — DDIL integration readiness

- All writes pass through `OfflineLearningGateway`.
- No React component directly touches production IndexedDB.
- Sync status UI consumes gateway state.
- Add tests proving gateway can be swapped.

Phase 7 — PWA/offline shell work

Only after frontend flows are stable and Chris/Naquan agree on the interface:

- service worker;
- cached shell;
- module asset cache;
- integration with production DDIL implementation.

## 30. Frontend acceptance checks before integration

The local frontend should demonstrate:

- app renders on narrow mobile viewport;
- real RCO logo is used;
- 15-question JSON fixture loads;
- no question text is hard-coded into React components;
- Spanish Assist can toggle;
- scoring is deterministic;
- initial score is preserved;
- remediation changes mastery but not initial score;
- correct-answer review is read-only;
- full retry creates a new attempt;
- XP does not affect score;
- trainer dashboard can render all required fields from fixture data;
- offline/sync statuses are present in the UI contract;
- no component directly depends on a specific backend host;
- no component directly depends on a specific database;
- no component directly depends on GitHub;
- no remote/GitHub operation occurs.

## 31. RCO source materials to copy into the local repo

Keep original RCO material separate from generated app content.

Recommended private/reference location:

```text
docs/rco-source-private/
```

These are source/reference files, not application code.

Copy the RCO-supplied materials you currently have, including:

### Branding

```text
rc_color.svg
rc_split_color.svg
Raíces CYBER LOGO.pdf
```

For runtime frontend use, duplicate only the approved SVG(s) into:

```text
public/brand/
```

### Program / curriculum source

Copy the RCO curriculum Markdown files delivered by Nick/RCO, including the files currently available such as:

```text
outline.md
RCYC CYBERSECURITY OPERATIONS CENTER (SOC) ANALYST PROGRAM.md
RCYC SOC Analyst Program Master Curriculum Answer Key.md
RCYC SOC ANALYST PROGRAM INSTRUCTOR FACILITATION MANUAL (DAYS 1–9).md
RCYC SOC ANALYST PROGRAM EXPANDED 9-DAY INSTRUCTOR MASTER MANUAL.md
```

If you have the separate daily curriculum files locally, include those too:

```text
DAY 1 FOUNDATION — ROLES, TEAMS & ETHICS.md
DAY 2 VERSION CONTROL — DIGITAL FOOTPRINTS & GITHUB.md
DAY 3 RECONNAISSANCE — OSINT & FOOTPRINTING.md
DAY 4 WEB AUDITING — SOURCE CODE & DOM ANALYSIS.md
DAY 5 TRAFFIC ANALYSIS — LOGS, PACKETS & NETWORK RECON.md
DAY 6 TERMINAL OPERATIONS — LINUX.md
DAY 7 USER ACCESS CONTROLS — PERMISSIONS.md
DAY 8 DIGITAL FORENSICS.md
DAY 9 NETWORK DEFENSE — FIREWALL.md
```

Use the actual filenames you received; do not rename source files merely to match this list if their official names differ.

### RCO quiz / roster reference

Copy:

```text
Kahoot_quizes.xlsx
sample_roster_deidentified.csv
```

Keep these as reference/source data.

Do not make the application depend on opening the Excel file at runtime.

Use normalized JSON fixtures for runtime development.

### Client correspondence / decisions

If available locally, copy the original Nick email response/export and the Oct. 7 Zoom transcript or meeting notes into:

```text
docs/rco-source-private/communications/
```

The compiled RootSync document:

```text
RootSync_RCO_Nick_Responses_to_Followup_Questions.docx
```

is useful as a working reference, but remember it is a RootSync compilation of RCO correspondence, not an original curriculum file.

### Not currently required / still outstanding

Do not block frontend work waiting for:

```text
21-question interest assessment
```

unless RCO sends it.

## 32. RootSync internal documents to copy into the local repo

Recommended:

```text
docs/project/
```

Useful current internal references:

```text
RootSync_RCO_Tetherless_PRD_Draft_2026-10-06.docx
Tetherless_Project_Plan_v2.20 by Marc.docx
RootSync_RCO_PRD_Clarified_and_Open_Items_Report.docx
RootSync_RCO_Tetherless_Technology_Stack_Recommendation.docx
Tetherless_Device_Compatibility_Report.pdf
```

Also copy the current frontend prototypes/reference artifacts:

```text
RCO_Tetherless_Beginner_Gamified_Module_v2.json
RCO_Tetherless_Beginner_Gamified_Mockup_v4.html
```

Suggested location:

```text
docs/ux-reference/
```

and duplicate the JSON fixture into:

```text
src/content/fixtures/operation-cyber-squad.json
```

The HTML mockup is a design/behavior reference only. Do not copy its single-file architecture into production React code.

## 33. Privacy / source-document handling

Some materials may contain learner-related structure or client-internal information.

Even though the roster sample is de-identified:

- keep raw RCO source files out of public app assets;
- do not serve raw curriculum manuals or roster files from `public/`;
- do not include source correspondence in the browser bundle;
- use sanitized fixtures for frontend demo data;
- when a GitHub repository is eventually used, review which `docs/rco-source-private/` files should be excluded via `.gitignore` or otherwise withheld from a public repo.

For this local-only phase, keep those materials local.

## 34. Open RCO questions that should not block frontend work

Keep these configurable instead of hard-coding an assumption:

- exact pass threshold;
- exact definition of a "struggling" learner;
- exact required offline duration;
- learner username uniqueness / mapping rules;
- trainer authentication method;
- final lost/replacement-phone recovery behavior;
- exact content publishing workflow after handoff;
- final production hosting ownership;
- final RCO acceptance/sign-off owner;
- whether assignments are required by learner/cohort in the first release.

Frontend implication:

- use configuration values;
- avoid embedding policy into UI components;
- use mock trainer auth/route protection for now;
- use a simple mission library fixture until assignment rules are final.

## 35. Development/demo infrastructure direction — not for current local phase

Current likely capstone deployment direction:

```text
Frontend:
static React/Vite PWA hosting

API:
team-selected lightweight live API host

Database:
Neon PostgreSQL for development/testing/demo

Later RCO production:
portable API + PostgreSQL via Docker Compose / RCO-controlled infrastructure
```

GitHub Pages is a possible later frontend host.

Do not configure any of this until Chris explicitly ends the local-only phase.

## 36. Definition of a successful first local frontend milestone

A successful first milestone is not "all screens exist."

It is:

```text
Real RCO branding
        +
JSON-driven beginner mission
        +
15 questions
        +
Spanish Assist
        +
initial score
        +
remediation
        +
current mastery
        +
review flows
        +
trainer fixture dashboard
        +
clean OfflineLearningGateway boundary
```

The entire flow should run locally with no backend and no GitHub dependency.

## 37. Recommended first prompt for Codex

Chris can give Codex the following instruction after placing this file in the local repo:

```text
Read docs/CODEX_FRONTEND_HANDOFF.md completely before changing any files.

We are starting only the Tetherless frontend locally. Do not access or interact with GitHub or any remote repository. Do not deploy anything.

First inspect the local RCO source/reference files and the existing gamified JSON/HTML prototype if present. Then propose a concise implementation plan for Phase 1 and Phase 2 from the handoff.

Use React + TypeScript + Vite + Tailwind. Keep UI components independent from the production DDIL and backend implementations. Create the typed OfflineLearningGateway and TrainerDataGateway interfaces and temporary mock adapters. Load the beginner module from normalized JSON instead of hard-coding question content.

Do not implement a second offline architecture. Do not use live backend services yet.

Before writing code, list:
1. files/folders you will create;
2. dependencies you want to install;
3. assumptions you are making;
4. any conflict you find between the handoff and the supplied RCO source material.

Then wait for approval before making the first substantial implementation change.
```

## 38. Final implementation principle

The frontend should be able to evolve from:

```text
Mock gateways
```

to:

```text
Naquan's production DDIL gateway
+
Marc/team backend API
```

without rebuilding the learner experience.

That interface separation is the most important architectural requirement for starting frontend work safely before the final PRD and full integration are complete.
