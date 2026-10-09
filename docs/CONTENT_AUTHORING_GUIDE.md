# Tetherless content authoring guide

## Safe workflow

1. Copy [`src/content/templates/tetherless-module.template.json`](../src/content/templates/tetherless-module.template.json) as a starting point. It is deliberately a valid one-question module, so every placeholder can be replaced safely.
2. Give the module, every question, every choice, and every sector stable unique IDs. Do not rename IDs after learner attempts exist.
3. Write the English learner-facing copy first. Add Spanish Assist translations wherever they are available.
4. Keep `settings.question_count` equal to the number of questions.
5. Ensure every `correct_choice` matches a choice ID and every sector question ID exists in the module.
6. Keep the passing score between 0 and 100. It remains configuration, not a UI hard-code.
7. Run `npm run validate:content` before using a changed fixture.

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
4. Review the learner flow on an RCO representative mobile viewport. Do not use a template as learner-ready content without content-owner review.
