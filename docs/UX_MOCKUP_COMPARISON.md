# UX mockup comparison pass

The current frontend was compared against the supplied UX-reference HTML mockups. The implemented UI retains their dark RCO visual language while improving mobile and accessibility behavior.

## Incorporated details

- dark ink/panel surfaces with violet and cyan accents;
- prominent mission header, progress treatment, sector map, reward summary, and question navigation;
- color-coded answer choices inspired by the mockup, with text and accessible state labels so color is never the only signal;
- compact phone layouts, large tap targets, and no required horizontal scrolling;
- clear review, practice, mastery, sync, and trainer states.

## Intentional differences

- The production prototype uses a single-column answer layout on narrow screens for readability and reliable touch targets.
- It does not claim installed-app or durable offline behavior before the DDIL/service-worker work is integrated.
- It avoids copying any external LMS implementation or code.
- Visual additions remain data-driven through module fixtures rather than hard-coded into one mission.

## Review cadence

1. Run `npm run test:device` after an interface change.
2. Review the five approved screenshots in `e2e/rco-mobile.spec.ts-snapshots/`.
3. Use the GitHub Actions manual visual-candidate workflow when an intentional baseline update needs team review.
4. Re-check real devices once the DDIL layer is available.
