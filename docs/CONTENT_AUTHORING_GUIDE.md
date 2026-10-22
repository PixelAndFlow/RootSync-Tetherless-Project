# Tetherless content authoring guide

## Safe workflow

1. Copy [`src/content/templates/tetherless-module.template.json`](../src/content/templates/tetherless-module.template.json) as a starting point. It is deliberately a valid one-question module, so every placeholder can be replaced safely.
2. Give the module, every question, every choice, and every sector stable unique IDs. Do not rename IDs after learner attempts exist.
3. Write the English learner-facing copy first. Add Spanish Assist translations wherever they are available.
4. Keep `settings.question_count` equal to the number of questions.
5. Ensure every `correct_choice` matches a choice ID and every sector question ID exists in the module.
6. Use a positive integer `content_version`. The integration demo starts at 1;
   do not convert existing published versions without an agreed migration.
   The server's settings determine passing thresholds; a module's optional
   `passing_score_percent` is not authoritative. `note` is staff-only, and an
   `activity_type` does not imply a game renderer exists.
7. Run `npm run validate:content` before using a changed fixture.

On the integration branch, `npm.cmd run check:shared-content` also checks fixtures
with Marc's browser-bundled validator at fetched commit `e2ceb7e`. This is a
read-only compatibility probe, not a second copied validator or a live import
feature. See [integration status](FRONTEND_INTEGRATION_STATUS.md).

## What the current validator protects

- required schema, module, question, choice, and sector identifiers;
- question count and passing-score range;
- English title, prompt, feedback, choice, topic, and sector-name copy;
- duplicate IDs and repeated sector question references;
- missing correct choices and sector references to nonexistent questions.

## Intentionally not decided yet

- content publishing API or editor;
- learner/cohort assignment rules;
- final content-version migration behavior;
- backend authorization and trainer approval workflow.

Keep JSON fixtures local and pass them through the typed gateway/content boundary. Do not put raw RCO source documents or learner data in module fixtures.

## Before adding a module to the library

1. Replace all visible placeholder text and give the module a stable, descriptive `module_id`.
2. Add the module import to `src/content/modules.ts` only after it passes validation.
3. Run `npm run validate:content`, then `npm test`.
4. Run `npm run report:spanish-coverage`. It reports untranslated learner-facing copy without rejecting an English-first draft.
5. Review the learner flow on an RCO representative mobile viewport. Do not use a template as learner-ready content without content-owner review.

## Frontend-only content preview

`src/content/fixtures/secure-workspace-basics.preview.json` is a valid bilingual preview fixture for testing cards and Spanish Assist. It is deliberately not imported by `moduleLibrary`, so it never appears to learners until content owners approve it.
