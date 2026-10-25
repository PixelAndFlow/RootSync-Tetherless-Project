# Tetherless App Build Reference
## RootSync / Raíces Cyber Organization (RCO)
### Consolidated product, frontend, DDIL, architecture, hosting, content, and build notes
Updated: October 2026

---

## 1. Purpose

This document consolidates the main decisions, requirements, architecture ideas, frontend PRD details, offline/DDIL integration approach, hosting choices, content model, scoring logic, trainer reporting expectations, gamification direction, testing strategy, and local-development workflow discussed for the Tetherless capstone.

It is intended as an offline working reference for Chris while building the frontend and coordinating with Naquan and Marc. It is a working product/engineering reference, not a replacement for the final team PRD. Where RCO has confirmed something, this document treats it as a requirement. Where RootSync proposed something, it is identified as a design or implementation direction.

---

# 2. Product summary

Tetherless is an offline-first, mobile-focused cybersecurity learning application for Raíces Cyber Organization.

Its purpose is to let RCO cyberathletes continue practicing cybersecurity concepts outside the classroom even when internet access is unreliable or unavailable.

The learner should be able to:

- open the app on a personal phone;
- download or access assigned training content;
- complete training while fully offline;
- receive immediate local scoring and feedback;
- close and reopen the app without losing progress;
- reconnect later and safely synchronize activity;
- review missed questions and improve mastery;
- see lightweight engagement/gamification feedback.

RCO trainers should be able to:

- confirm that learners completed assigned work;
- view first-attempt scores;
- see current mastery after remediation;
- identify weak topics;
- review activity and engagement metrics;
- see synchronized learner activity through a trainer dashboard;
- export data in structured form if needed.

Five-word shorthand:

> Offline learning. Progress saved. Syncs.

---

# 3. Product positioning

Tetherless is not intended to replace RCO's classroom training or become a full LMS.

It is best understood as:

> A lightweight offline-first training companion for at-home cybersecurity reinforcement.

RCO owns and creates the curriculum. RootSync builds the platform that delivers, tracks, stores, synchronizes, and reports that curriculum.

A useful internal analogy discussed earlier:

> RCO's JSON/CSV content is the record; Tetherless is the jukebox.

---

# 4. Confirmed RCO context and requirements

## Learners and devices

- Personal phones are the primary learner device.
- One primary phone per learner is the MVP assumption.
- Cross-device migration is not required for MVP.
- Target environment includes older and lower-resource phones.
- Provisional support floor: iOS 16.4+ and Android 10+.
- Representative hardware: roughly 2–3 GB RAM, limited free storage, older iPhone and budget Android classes.
- Mobile-first design is mandatory.

## Training context

- Tetherless supplements RCO's in-person cybersecurity bootcamp.
- RCO wants students to continue practice at home.
- Connectivity may be disconnected, intermittent, disrupted, or limited.
- The app must work fully offline after required content is available locally.

## Learner identity

Current direction:

- learner enters real name;
- learner also has a username;
- the app generates and maintains an internal stable learner/device identifier.

Still to finalize with RCO:

- whether username must be globally unique;
- whether username is assigned by RCO or selected by the learner;
- how username maps to RCO roster data.

## Curriculum

- RCO creates and owns the curriculum.
- RootSync should not require a developer for routine content updates after handoff.
- JSON is acceptable to RCO.
- CSV should also be supported as a staff-friendly authoring/import format.
- Runtime app content should normalize into one canonical JSON model.
- First polished exercise type should be multiple choice.
- RCO has supplied real cybersecurity curriculum and sample quiz content.

## Language

- English is the primary cybersecurity-learning language.
- RCO has bilingual English/Spanish materials.
- Bilingual support is desirable.
- Current frontend design direction is English primary with optional Spanish Assist.

## Trainer requirements

RCO wants proof of completion and useful performance data.

Requested metrics include:

- total questions;
- questions answered;
- correctness;
- completion timestamp;
- percentage score;
- duration;
- app leave/return behavior;
- topic/skill evidence.

JSON is preferred for post-processing. A trainer dashboard is part of the current product direction.

## AI

AI is not a core scoring dependency.

Current direction:

- deterministic scoring and analytics are P0;
- AI may later provide plain-language interpretation or recommendations;
- AI must not become the source of truth for score, progress, sync integrity, or accepted events.

## Hosting / operations

RCO prefers:

- low recurring cost;
- lightweight deployment;
- Docker Compose;
- PostgreSQL;
- self-hosting as a future production option.

For development and presentation, managed services are acceptable.

## Visual / interaction preferences

- dark mode required;
- OLED-style near-black background is a good fit;
- cyber/terminal visual style is appropriate;
- black / purple / cyan direction is suitable;
- Poppins is the confirmed font;
- RCO logo assets should be used directly;
- no at-home countdown timer;
- interactive cybersecurity/spy theme is welcome;
- avoid forced reminders.

---

# 5. Team ownership direction

Team: Chris, Naquan, Marc.

## Chris — frontend / learner and trainer experience

Chris proposes to own:

- learner UI;
- onboarding;
- module library;
- training screens;
- bilingual/Spanish Assist UI;
- gamification presentation;
- results and review screens;
- remediation flow;
- trainer dashboard frontend;
- sync/offline status presentation;
- frontend service contracts.

Chris has already created/tested mockups for learner flow, gamification, bilingual UI, results/review, and trainer dashboard.

## Naquan — offline / DDIL layer

Naquan's current focus:

- IndexedDB/local persistence;
- append-only event queue;
- pending/synced state;
- reconnect logic;
- retry behavior;
- idempotent event delivery;
- sync batching;
- acknowledgment handling.

## Marc — backend / API / database

Likely backend responsibilities:

- API;
- PostgreSQL;
- server-side validation;
- idempotency/deduplication;
- reporting aggregation;
- deployment;
- trainer data endpoints.

This ownership model lets the team work in parallel.

---

# 6. Frontend PRD — Chris's workstream

## Frontend objective

The Tetherless frontend will be a mobile-first React + TypeScript PWA designed for learners using personal phones and for instructors using a browser-based trainer view.

The frontend should remain lightweight, responsive, usable on older devices, accessible, offline-aware, and independent from direct database or persistence implementation details.

## Learner experience

The frontend should let a learner:

- complete onboarding;
- browse available missions/modules;
- see which modules are available offline;
- start a module;
- answer questions;
- receive immediate local correctness feedback;
- see progress;
- close and reopen the app without losing state once integrated with DDIL;
- complete a module;
- review results;
- practice missed questions;
- review correct answers;
- retry the whole module;
- see current sync status.

## Trainer experience

The same frontend application may expose a protected trainer route.

Trainer UI should show synchronized backend data rather than directly reading learner-device IndexedDB.

Trainer views should include:

- learner list;
- module completion;
- initial score;
- current mastery;
- questions answered;
- missed questions;
- remediation progress;
- topic performance;
- sector performance;
- active engagement time;
- session count;
- leave/return count;
- attempts;
- sync state;
- last activity.

---

# 7. Preferred frontend stack

Current frontend direction:

```text
React
TypeScript
Vite
Tailwind CSS
React Router
Vitest
React Testing Library
```

PWA support should be added after core flows are stable.

Possible later additions:

- Workbox / Vite PWA plugin;
- real IndexedDB/Dexie adapter after integration;
- Capacitor only if needed.

---

# 8. Browser PWA vs standalone app

The MVP should be built as an installable PWA.

## Why PWA first

- one codebase;
- works in browser;
- can be added to home screen;
- full-screen app-like UX;
- service-worker caching;
- offline operation;
- easier deployment;
- no App Store/Play Store approval for capstone;
- simpler maintenance.

Conceptually:

```text
Browser
  ↓
Install to Home Screen
  ↓
PWA
  ↓
Offline content + local progress
  ↓
Sync when connection returns
```

## Capacitor as future option

Capacitor can wrap the same React app as native iOS/Android.

Possible benefits:

- stronger native filesystem access;
- native SQLite through plugins;
- stronger app lifecycle hooks;
- better access to device APIs;
- native notification options;
- App Store / Play Store distribution.

Capacitor is justified if:

1. real-device testing shows PWA/IndexedDB durability is not reliable enough;
2. RCO explicitly wants app-store distribution;
3. future learning activities require native capabilities.

Do not add Capacitor merely because native sounds more professional.

---

# 9. Hosting / deployment direction

## Frontend

GitHub Pages is acceptable for future development/demo hosting of the React/Vite PWA.

It is suitable because the frontend is static, HTTPS is available, service workers require HTTPS outside localhost, and a custom domain can be added later.

Potential future URL:

```text
https://rootsync.github.io/tetherless/
```

or a custom RCO domain later.

HashRouter may be used for static-host compatibility:

```text
/#/learner
/#/trainer
```

## Database

Neon PostgreSQL is the preferred development/testing/presentation database.

Important:

- Neon is the PostgreSQL host, not the API server.
- The database may suspend compute when idle.
- Data remains persistent.
- The next query wakes the compute.
- The brief wake delay is acceptable because unsynced learner events remain queued locally until acknowledged.

## Backend API

The architecture still requires a live API host between the PWA and Neon:

```text
GitHub Pages / PWA
        ↓
Backend API
        ↓
Neon PostgreSQL
```

The API hosting service should avoid long cold starts if possible.

## RCO production later

Preferred handoff direction:

```text
Frontend
+
API
+
PostgreSQL
+
Docker Compose
```

RCO/Nick can eventually self-host PostgreSQL and API infrastructure if desired. Keep the application close to standard PostgreSQL to avoid Neon lock-in.

---

# 10. Frontend / DDIL separation

The most important integration rule:

> React components should not directly manipulate IndexedDB or sync queues.

Use a frontend service/gateway abstraction.

Conceptual architecture:

```text
React UI
   ↓
Frontend service interface
   ↓
Naquan DDIL layer
   ↓
IndexedDB / Outbox / Sync Queue
   ↓
Backend API
   ↓
PostgreSQL
```

This lets Chris build the complete learner flow before Naquan's production offline layer is finished.

---

# 11. Naquan's current DDIL architecture

Naquan proposed the offline layer as a transparent persistence proxy between UI state and API communication.

Current concept:

1. UI action happens.
2. Action is written locally first.
3. Local state updates optimistically.
4. A mutating action is appended to an offline queue.
5. Event remains pending.
6. When connection becomes available, events are sent to `/api/v1/sync`.
7. Backend processes events idempotently.
8. Backend returns a per-event acknowledgment.
9. Local record becomes synced only after explicit acknowledgment.

Initial conceptual event:

```ts
{
  id,
  actionType,
  payload,
  timestamp,
  status: "pending" | "synced"
}
```

Recommended normalized direction:

```ts
export interface TetherlessEvent<TPayload = unknown> {
  event_id: string;
  schema_version: number;

  learner_id: string;
  device_id: string;

  module_id: string;
  content_version: string;

  attempt_id?: string;
  question_id?: string;

  event_type: string;

  payload: TPayload;
  client_timestamp: string;

  status:
    | "pending"
    | "syncing"
    | "synced"
    | "retryable_error"
    | "rejected";
}
```

Important principles:

- event IDs are UUIDs;
- event history is append-only where practical;
- duplicate delivery of the same event must be safe;
- last-write-wins should not be the default learning-record model;
- local data is not marked synced until server ACK;
- interrupted sync must not lose accepted or pending events.

---

# 12. Recommended event types

```text
session_started
session_ended
app_backgrounded
app_returned
module_opened
question_answered
question_checked
module_completed
remediation_started
remediation_answered
remediation_completed
full_retry_started
full_retry_completed
```

More types can be added later. UI components should not invent arbitrary event names independently.

---

# 13. Sync response model

Recommended API response:

```ts
type SyncResultStatus =
  | "accepted"
  | "duplicate"
  | "retryable_error"
  | "rejected";

interface SyncEventResult {
  event_id: string;
  status: SyncResultStatus;
  reason?: string;
}

interface SyncBatchResponse {
  results: SyncEventResult[];
  server_timestamp: string;
}
```

Frontend/offline behavior:

- accepted → mark synced;
- duplicate → mark synced because server already has it;
- retryable_error → keep pending;
- rejected → preserve locally with reason;
- network loss before ACK → keep pending.

---

# 14. Sync trigger strategy

Do not depend only on browser Background Sync.

Recommended triggers:

- app start;
- app resume;
- browser online event;
- manual Sync button;
- opportunistic retry when app is active and online.

This is especially important for iOS, where background behavior can be inconsistent.

---

# 15. Frontend gateway contract

Recommended interface:

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

During local frontend development, Chris can use an in-memory adapter, localStorage adapter, or simple fixture-backed adapter.

The temporary implementation must be easy to replace with Naquan's production Dexie/IndexedDB layer.

---

# 16. Trainer gateway contract

Trainer screens should not scatter raw fetch calls across React components.

Recommended abstraction:

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

For local work, use fixture data. Later, replace the mock with live API calls.

---

# 17. Content architecture

RCO may provide CSV or JSON. Both should normalize to canonical Tetherless JSON.

Do not build separate CSV and JSON quiz engines.

Build:

```text
CSV/JSON import
      ↓
validation/normalization
      ↓
Tetherless JSON
      ↓
frontend renderer
```

---

# 18. Core content schema

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

Validation should eventually catch duplicate question IDs, missing correct choices, invalid correct-choice IDs, missing content version, reused identifiers, and missing referenced assets.

---

# 19. Question logic vs presentation

Question logic and presentation must be separate.

Examples:

```text
type = multiple_choice
presentation = kahoot_cards
```

```text
type = scenario_mc
presentation = mission_alert
```

Possible presentation types:

```text
kahoot_cards
mission_alert
security_alert
policy_card
code_card
evidence_diff
boss_question
image_choice
```

Changing presentation should not automatically change scoring behavior.

---

# 20. First polished module

Working module:

> Operation Cyber Squad

Learner level:

> Recruit

The current module is a 15-question beginner mission built from RCO curriculum concepts.

Topics include Red Team, Blue Team, GRC, White/Grey/Black Hat, written authorization, Scope of Work, Rules of Engagement, version control, Git, Markdown, visual diffs, and scope boundaries.

Suggested sectors:

```text
Sector 1 — Know Your Team
Sector 2 — Stay Inside the Rules
Sector 3 — Protect the Evidence
Final Challenge
```

These labels are RootSync UX proposals and should remain configurable.

---

# 21. Learner flow

```text
Welcome / Setup
      ↓
Mission Library
      ↓
Mission Detail
      ↓
Available Offline / Download
      ↓
Start Mission
      ↓
Question Flow
      ↓
Mission Debrief
      ↓
Practice Missed | Review Correct | Try All Again
```

Secondary review options:

- review initially missed answers;
- review all answers.

---

# 22. Spanish Assist

Current frontend design:

OFF: English only.

ON: English primary, Spanish displayed underneath in smaller/lower-emphasis text.

Rules:

- English cyber terminology remains visible.
- Spanish is stored separately.
- No live translation service.
- No dependency on Google Translate.
- Preference should eventually persist locally.
- Same question logic regardless of language.
- Spanish should be reviewed content.

Example:

```json
{
  "prompt": {
    "en": "Which team simulates attacks?",
    "es": "¿Qué equipo simula ataques?"
  }
}
```

---

# 23. Scoring model

The app should distinguish four separate concepts:

1. completion;
2. initial score;
3. current mastery;
4. engagement/gamification.

## Completion

Completed means all required questions have been answered. Completion should be independent from pass/fail threshold.

## Initial score

The first fully completed attempt is preserved.

Example:

```text
10 / 15
66.7%
```

## Current mastery

Current mastery reflects concepts/questions eventually mastered after remediation.

Example:

```text
Initial score: 10/15 = 66.7%
Missed-question practice: 4 of 5 corrected
Current mastery: 14/15 = 93.3%
```

Critical rule:

> Never overwrite the initial score with the improved mastery score.

---

# 24. Retry / remediation logic

## Practice Missed Questions

- redo only unresolved/missed questions;
- preserve initial score;
- corrected questions can improve mastery;
- do not create fake first-attempt performance.

## Review Correct Answers

- read-only;
- show selected answer;
- show correct answer;
- show explanation;
- Spanish Assist if enabled;
- no score change;
- no mastery change;
- no XP farming.

## Try All Again

- creates a new full attempt;
- preserves attempt history;
- does not replace the original first attempt.

---

# 25. Gamification direction

Gamification is a RootSync design proposal rather than a strict RCO requirement.

Recommended lightweight mechanics:

- mission framing;
- sectors;
- XP;
- correct-answer streak;
- Cyber Shield;
- badge;
- progression levels;
- final challenge.

Possible progression labels:

```text
Recruit
Analyst
Incident Responder
```

Gamification must never distort learning data. XP stays separate from score.

Do not add:

- lives/hearts;
- countdown timers;
- realtime multiplayer;
- realtime leaderboard;
- heavy video;
- heavy animation;
- rewards dependent on live connectivity.

Avoid XP farming through repeated review.

---

# 26. Trainer reporting model

Recommended learner/module record:

```text
learner
module
content_version
first_started
first_completed
questions_total
questions_answered
initial_correct
initial_score_percent
initial_missed_count
current_mastered
current_mastery_percent
still_unmastered
remediation_attempted
remediation_corrected
full_attempt_count
remediation_round_count
active_time
elapsed_time
session_count
return_count
best_streak
xp
completion_status
sync_status
topic_performance
sector_performance
question_history
```

Recommended trainer table:

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

Example learner detail:

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

---

# 27. Engagement-time tracking

Avoid counting the entire elapsed browser-open period as study time.

Recommended logic:

- count active time while app is foregrounded;
- pause when app is backgrounded;
- pause after configurable inactivity threshold;
- resume on learner activity;
- count leave/return as session behavior.

Track both elapsed and active engagement time where useful. Trainer reporting should primarily rely on active time.

---

# 28. Sync status UX

Learners should understand whether work is safely stored and whether RCO has received it.

Recommended states:

```text
Offline
Saved locally
Waiting to sync
Syncing
Synced
Sync failed — retry available
```

Do not expose technical IDs, queue internals, or raw database errors.

A manual Sync control should be supported even when automatic sync exists.

---

# 29. Offline storage rules

Separate two categories.

## Deletable content

- module JSON;
- images;
- cached assets.

## Protected learner records

- answers;
- attempts;
- progress;
- unsynced events;
- scores;
- mastery;
- event queue.

Critical rule:

> Never automatically delete unsynced learner activity to free storage.

Low-storage behavior should warn the learner, suggest removal of old/completed module assets, require confirmation, and preserve protected learner data.

---

# 30. PWA / local storage testing scenarios

Core DDIL tests:

1. Download module while online.
2. Turn on airplane mode.
3. Launch app offline.
4. Answer several questions.
5. Close app.
6. Reopen while offline.
7. Confirm answers/progress remain.
8. Complete module offline.
9. Reboot/close device/app.
10. Reopen offline.
11. Confirm completion remains.
12. Reconnect.
13. Begin sync.
14. Interrupt connection mid-sync.
15. Reconnect again.
16. Confirm accepted records are not duplicated.
17. Confirm pending records continue retrying.
18. Repeat same event.
19. Confirm backend deduplication.
20. Confirm trainer report matches accepted server events.

---

# 31. Device acceptance target

Representative minimum testing:

- iPhone 8 / iOS 16.7-class;
- Android 10 budget phone;
- 2 GB Android stress case;
- 3 GB Android reference;
- current iOS/Android for forward compatibility.

If PWA IndexedDB fails durability testing under realistic conditions, evaluate:

```text
React frontend
        ↓
Capacitor
        ↓
native SQLite
```

Do not jump to this before testing.

---

# 32. Local project development mode

Current development choice:

> Work only from Chris's local repo for now.

Local path:

```text
C:\Users\k8woz\OneDrive\Documents\RootSync-Tetherless-Project
```

During this phase:

- do not push to GitHub;
- do not pull;
- do not fetch;
- do not change GitHub remote;
- do not deploy;
- do not connect to production services;
- do not implement live backend calls until requested.

Local Git itself is acceptable. A local Git repository does not automatically touch GitHub.

---

# 33. Local project structure

Current seed structure:

```text
RootSync-Tetherless-Project/
├── CODEX_FRONTEND_HANDOFF_Tetherless_2026-10-08.md
│
├── docs/
│   ├── CODEX_FRONTEND_HANDOFF.md
│   ├── LOCAL_SEED_MANIFEST.md
│   │
│   ├── rco-source-private/
│   │   ├── branding/
│   │   ├── curriculum/
│   │   ├── data/
│   │   └── communications/
│   │
│   ├── project/
│   └── ux-reference/
│
├── public/
│   └── brand/
│       ├── rc_color.svg
│       └── rc_split_color.svg
│
└── src/
    └── content/
        └── fixtures/
            └── operation-cyber-squad.json
```

Suggested application structure later:

```text
src/
├── app/
│   ├── routes/
│   └── providers/
├── components/
│   ├── common/
│   ├── learner/
│   ├── trainer/
│   └── gamification/
├── features/
│   ├── onboarding/
│   ├── missions/
│   ├── training/
│   ├── remediation/
│   ├── review/
│   ├── results/
│   ├── sync-status/
│   └── trainer-dashboard/
├── content/
│   ├── schema/
│   └── fixtures/
├── services/
│   ├── offline/
│   └── trainer/
├── types/
├── utils/
├── styles/
└── tests/
```

---

# 34. RCO source files to keep locally

Recommended under:

```text
docs/rco-source-private/
```

## Branding

```text
rc_color.svg
rc_split_color.svg
Raíces CYBER LOGO.pdf
```

Runtime copies of approved SVGs may be placed in:

```text
public/brand/
```

## Curriculum

```text
outline.md
RCYC CYBERSECURITY OPERATIONS CENTER (SOC) ANALYST PROGRAM.md
RCYC SOC Analyst Program Master Curriculum Answer Key.md
RCYC SOC ANALYST PROGRAM INSTRUCTOR FACILITATION MANUAL (DAYS 1–9).md
RCYC SOC ANALYST PROGRAM EXPANDED 9-DAY INSTRUCTOR MASTER MANUAL.md
DAY 1 FOUNDATION — ROLES, TEAMS & ETHICS.md
DAY 2 VERSION CONTROL — DIGITAL FOOTPRINTS & GITHUB.md
DAY 3 RECONNAISSANCE — OSINT & FRAMEWORKS.md
DAY 4 WEB AUDITING — SOURCE CODE & DOM ANALYSIS.md
DAY 5 TRAFFIC ANALYSIS — LOGS, PACKETS & NETWORK RECON.md
DAY 6 TERMINAL OPERATIONS — LINUX BASICS & COMMAND-LINE NAVIGATION.md
DAY 7 USER ACCESS CONTROLS — LINUX FILE PERMISSIONS & HARDENING.md
DAY 8 DIGITAL FORENSICS & ARTIFACT ANALYSIS.md
DAY 9 NETWORK DEFENSE & HOST FIREWALL CONFIGURATION.md
```

## Data / quiz reference

```text
Kahoot_quizes.xlsx
sample_roster_deidentified.csv
```

Do not make the frontend open the Excel file at runtime. Normalize content to JSON.

---

# 35. Internal RootSync reference documents

Recommended under:

```text
docs/project/
```

Useful references:

```text
RootSync_RCO_Tetherless_PRD_Draft_2026-10-06.docx
Tetherless_Project_Plan_v2.20 by Marc.docx
RootSync_RCO_PRD_Clarified_and_Open_Items_Report.docx
RootSync_RCO_Tetherless_Technology_Stack_Recommendation.docx
Tetherless_Device_Compatibility_Report.pdf
Tetherless_Offline_First_DDIL_Architecture.docx
RootSync_RCO_Tetherless_Moodle_Foundation_Research_Report.docx
RootSync_RCO_Tetherless_Market_Scan_and_Build_vs_Adapt_Report.docx
Updated follow-up items and questions for RCO.docx
PRD Template.docx
```

---

# 36. Existing UX/reference artifacts

Useful local prototypes:

```text
RCO_Tetherless_Beginner_Gamified_Module_v2.json
RCO_Tetherless_Beginner_Gamified_Mockup_v4.html
```

Use them as design reference, behavior reference, and fixture/reference content.

Do not reproduce the single-file mockup architecture in production React code.

---

# 37. RCO curriculum progression

Current nine-day SOC program structure:

```text
Day 1 — Roles, Teams & Ethics
Day 2 — Version Control & GitHub
Day 3 — OSINT & Footprinting
Day 4 — Web Auditing & DOM Analysis
Day 5 — Traffic Analysis, Logs & Packets
Day 6 — Linux Terminal / CLI
Day 7 — Linux Permissions & Hardening
Day 8 — Digital Forensics & Hashes
Day 9 — Network Defense & Firewalls
```

This gives Tetherless a natural future module progression.

Potential learner progression:

```text
Beginner — roles / ethics / version control
Intermediate — OSINT / web analysis
Advanced — SOC incident hunting / logs / permissions / forensics / firewall
```

---

# 38. Moodle research conclusion

Moodle should be treated as a design/data-model reference, not the codebase for Tetherless.

Useful Moodle concepts:

```text
Course → Tetherless Program
Quiz/Activity → Mission
Question Bank → JSON Questions
Attempt → Attempt
Review → Review
Grade → Initial Score
Completion → Module Completed
Reports → Trainer Dashboard
```

Working phrase:

> Moodle-inspired learning logic, Kahoot-inspired presentation, custom DDIL/offline architecture for RCO.

---

# 39. Open RCO questions remaining

These should not block frontend development, but should remain configurable.

## High priority

- Is learner username unique?
- Is username learner-created or RCO-assigned?
- How should trainer authentication work?
- Who is final RCO acceptance/sign-off owner?

## Product policy

- What exactly counts as passing?
- What exact rule defines a struggling learner?
- How long should the app be expected to remain offline?
- Should assignments be required by learner/cohort for MVP?
- What happens after lost/replaced phone?
- What should happen after uninstall/reinstall?

## Operations

- Who updates/publishes curriculum after handoff?
- Where will source content live?
- Who owns production hosting/database?
- What recurring maintenance cost is acceptable?

## Lower priority

- 21-question interest assessment;
- formal studied-at-home definition;
- AI interpretation;
- advanced puzzle engines.

---

# 40. Recommended default assumptions until RCO answers

## Completion

```text
all required questions answered
```

## Pass threshold

Make configurable. Do not hard-code business policy deeply into components.

Temporary default if needed:

```text
80%
```

## Struggling

Do not lock into one formula. Possible signals:

- repeated incorrect answers;
- low first-attempt accuracy;
- multiple retries;
- persistent unmastered topic.

## Sync

Use automatic when possible plus a manual Sync button.

## Lost phone

For MVP:

- synchronized history stays on server;
- unsynced local work may be lost;
- cross-device restoration remains out of scope.

---

# 41. Recommended frontend build sequence

## Phase 1 — foundation

- React + TypeScript + Vite;
- Tailwind;
- Router;
- Poppins;
- dark design tokens;
- actual RCO logo;
- content types;
- JSON fixture loading;
- mission detail screen.

## Phase 2 — learner mission

- render 15 questions;
- Kahoot-style answer cards;
- Spanish Assist;
- progress bar;
- immediate feedback;
- mobile responsiveness.

## Phase 3 — learning logic

- first attempt;
- initial score;
- remediation;
- mastery;
- review correct;
- review missed;
- review all;
- full retry;
- attempt history.

## Phase 4 — gamification

- sectors;
- XP;
- streak;
- Cyber Shield;
- badge;
- final challenge.

## Phase 5 — trainer frontend

- learner table;
- module detail;
- score/mastery;
- topic performance;
- active time;
- attempts;
- sync status;
- fixture data.

## Phase 6 — DDIL integration readiness

- all writes go through OfflineLearningGateway;
- no direct IndexedDB access from components;
- sync status through gateway;
- adapter tests.

## Phase 7 — actual offline integration

After Chris and Naquan align on contract:

- service worker;
- app shell cache;
- IndexedDB/Dexie;
- outbox;
- sync integration;
- real reconnect behavior.

---

# 42. Local milestone definition

The first meaningful frontend milestone should demonstrate:

```text
Real RCO branding
+
JSON-driven module
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
clean offline gateway boundary
```

It should run locally with no backend, no Neon, no GitHub dependency, and no live API.

---

# 43. Frontend acceptance checklist

Before integration:

- app renders on narrow mobile viewport;
- official RCO logo is used;
- 15-question JSON fixture loads;
- question text is not hard-coded in React;
- Spanish Assist toggles;
- correctness logic is deterministic;
- initial score is preserved;
- remediation changes mastery only;
- read-only review does not change score;
- full retry creates a new attempt;
- XP does not affect academic score;
- trainer dashboard renders all required fields;
- sync/offline states exist in UI;
- components do not know backend host;
- components do not know database;
- components do not directly manipulate production IndexedDB;
- no remote Git operation is needed.

---

# 44. Git / GitHub working rules during local build

For the current phase, do not run remote operations such as:

```text
git push
git pull
git fetch
gh ...
```

unless Chris explicitly decides to reconnect to team GitHub work.

Local Git commands are fine:

```text
git status
git add
git commit
git diff
```

A local commit does not automatically publish anything.

---

# 45. Future team integration principle

Chris should be able to replace:

```text
MockOfflineLearningGateway
MockTrainerDataGateway
```

with:

```text
Naquan DDIL implementation
Marc/team API implementation
```

without rewriting learner screens.

This clean boundary is the most important technical protection against integration problems.

---

# 46. Recommended API direction

Possible API structure:

```text
POST /api/v1/sync
GET  /api/v1/modules
GET  /api/v1/trainer/learners
GET  /api/v1/trainer/modules/:moduleId
GET  /api/v1/trainer/learners/:learnerId
```

Exact backend routes remain a team decision.

The frontend should depend on typed gateway methods, not route strings scattered through components.

---

# 47. Data integrity principle

Use this mental model:

```text
Device records reality
Server validates
Analytics calculates
AI explains
```

Meaning:

- learner device records learning facts;
- server accepts/rejects events;
- backend analytics calculates scores/metrics;
- AI, if added, only interprets accepted structured evidence.

---

# 48. Privacy / security notes

Raw client materials should not be bundled into the browser.

Do not place under `public/`:

- roster CSV;
- internal RCO correspondence;
- Word documents;
- instructor manuals;
- raw source spreadsheets.

Only public runtime assets should be under `public/`, such as approved logo SVGs, public icons, and PWA assets.

Learner event payloads should avoid unnecessary personal information.

Trainer access will require authentication before production use.

---

# 49. Current build recommendation

Recommended path:

```text
LOCAL DEVELOPMENT NOW

React + TypeScript + Vite + Tailwind
        ↓
Mock gateways
        ↓
RCO JSON fixture
        ↓
Learner + Trainer frontend

THEN

Integrate Naquan DDIL
        ↓
Live API
        ↓
Neon PostgreSQL

LATER

RCO production Docker Compose / self-hosted PostgreSQL
```

This keeps the frontend moving without waiting for the final PRD or backend.

---

# 50. Current preferred Demo Day architecture

Likely capstone setup:

```text
Tetherless PWA
Hosted static frontend
        ↓
HTTPS API
        ↓
Neon PostgreSQL
```

Frontend hosting can later be GitHub Pages or another static host.

The PWA remains usable offline after installation/content download.

---

# 51. What not to build for MVP

To protect the schedule, avoid:

- native Swift app;
- native Kotlin app;
- complex LMS;
- realtime multiplayer;
- realtime leaderboard;
- full CMS;
- advanced AI tutor;
- multiple complex exercise engines;
- cross-device sync;
- video-heavy learning;
- elaborate animations;
- automatic Systeme.io/Zapier workflows;
- broad native notifications;
- arbitrary PDF/Word/PPT lesson import.

---

# 52. Future extension ideas

After core MVP is reliable:

- OSINT clue activities;
- hash verification;
- log analysis;
- evidence-diff questions;
- image-based matching;
- sequence questions;
- matching questions;
- simple terminal/evidence exercises;
- trainer content upload UI;
- richer analytics;
- AI skill-gap summaries;
- Capacitor/native packaging;
- native SQLite;
- notifications;
- additional RCO cohorts.

---

# 53. Short reference checklist

Before coding:

- read `CODEX_FRONTEND_HANDOFF`;
- confirm RCO source files exist;
- use real RCO logo;
- use JSON fixture;
- no remote Git/GitHub operations;
- no live API;
- use mock gateways.

Build first:

- mission library;
- question flow;
- Spanish Assist;
- scoring;
- results;
- remediation;
- review;
- retry;
- trainer dashboard.

Then integrate:

- IndexedDB;
- queue;
- sync;
- backend;
- Neon.

Test:

- offline launch;
- persistence;
- restart;
- interrupted sync;
- duplicate retry;
- trainer reconciliation;
- older phones.

Preserve:

- initial score;
- mastery;
- attempt history;
- unsynced events;
- content version;
- event IDs.

Do not confuse:

- score with XP;
- completion with passing;
- elapsed time with active time;
- local save with server sync.

---

# 54. Final implementation principle

Start the frontend now. Do not wait for every PRD question to be closed.

Build against stable boundaries:

```text
content schema
offline gateway
trainer gateway
scoring model
attempt/remediation model
sync-status model
```

Keep policy decisions configurable.

The frontend should remain independent from Naquan's internal IndexedDB implementation and Marc's backend implementation.

The key architectural rule is:

> The UI should know what it needs to do, but not how persistence, synchronization, or PostgreSQL are implemented.

That gives Chris a safe path to build the complete learner and trainer experience locally now while preserving a clean integration path for the rest of RootSync.

---

End of working reference.
