# UX mockup comparison pass

The current frontend was compared against the supplied UX-reference HTML mockups. The implemented UI retains their cybersecurity mission language while using a more focused VS Code-style black/gray system with RCO purple and magenta accents.

## Incorporated details

- dark ink/panel surfaces with RCO purple and magenta accents, plus an explicit accessible light-mode equivalent;
- prominent mission header, progress treatment, sector map, reward summary, and question navigation;
- red, blue, amber, and teal answer choices preserved only for `kahoot_cards` questions, including after answer feedback; written feedback and distinct borders ensure color is never the only signal;
- shared purple line icons for the mission map and in-mission sector checkpoints;
- compact phone layouts, large tap targets, and no required horizontal scrolling;
- clear review, practice, mastery, sync, and trainer states.

## Intentional differences

- The production prototype uses a single-column answer layout on narrow screens for readability and reliable touch targets.
- Dark mode is the default. Learners explicitly choose Dark mode or Light mode from Display preferences; the app does not infer or change the device's system theme.
- It does not claim installed-app or durable offline behavior before the DDIL/service-worker work is integrated.
- It avoids copying any external LMS implementation or code.
- Visual additions remain data-driven through module fixtures rather than hard-coded into one mission.

## Review cadence

1. Run `npm run test:device` after an interface change. This includes explicit dark/light theme and automated colour-contrast coverage.
2. Review the five approved screenshots in `e2e/rco-mobile.spec.ts-snapshots/`.
3. Use the GitHub Actions manual visual-candidate workflow when an intentional baseline update needs team review.
4. Re-check real devices once the DDIL layer is available.
