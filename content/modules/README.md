# Content modules

> **Trial run, 2026-10-15.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

One folder per module, named after its `module_id`. Each published version is a
separate file, `<module_id>.v<content_version>.json`, in the canonical format
described in `packages/content/README.md`. Older versions stay in the folder:
learner answers are stored with the version they were answered on.

| Module | Latest | Questions | Source |
|---|---|---|---|
| `pr-bootcamp-security-tools` | v2 | 15 + 14 Boss Mission | RCO Puerto Rico bootcamp Kahoot (`source/Kahoot_quizes.xlsx`) |
| `phishing-basics` | v1 | 15 + 12 Boss Mission | Written for Tetherless |

Topics, term labels, explanations, Spanish explanations, Boss Missions and the
whole `phishing-basics` module are drafts pending RCO review.

## Publishing a new version

```sh
cd packages/content
node src/cli.ts ../../content/modules/<module>/source/<file>.xlsx \
  --module-id <module> --content-version <next> --title-en "<title>" \
  --previous ../../content/modules/<module>/<module>.v<current>.json \
  --out ../../content/modules/<module>/<module>.v<next>.json
node --test "test/**/*.test.ts"
```

Edit JSON versions directly for changes a spreadsheet can't hold (topics,
terms, explanations, Boss Missions), raise `content_version`, and save as the
next file. The content test fails if a version reuses a retired ID or skips a
version number.
