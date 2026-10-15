# Block the Threat (prototype)

> **Trial run, 2026-10-15.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

A playable prototype of the Tetherless learning game, built on the modules in
`content/modules`. It is a single HTML file with no dependencies: open
`block-the-threat.html` in a browser.

- **Core loop:** a threat moves toward your network; pick one of four answers.
  A wrong answer shows the correct one with a one-sentence explanation.
- **Waves:** 8 threats mixing new terms with ones due for review (Leitner boxes,
  levels 1–5). Challenge mode adds a timer, a speed bonus and three shields
  (C, I, A). Practice mode has neither.
- **Progress tree:** each topic is a branch and each term is a node that glows
  brighter as it levels up. A branch with every term at level 3 unlocks its
  Boss Mission.
- **Ranks:** Recruit → Defender → Cyberathlete, counted across all modules.
- **Daily streak** with one free skip day per week.

Progress is saved in the browser's local storage. The production app will use
the offline sync layer instead.

## Rebuild after changing content or the template

```sh
node prototypes/block-the-threat/build.mjs
```

The build takes the latest version of every module, validates it with
`packages/content`, and writes `block-the-threat.html`. Requires Node 22.18+.
