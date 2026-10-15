# @tetherless/content

> **Trial run, 2026-10-15.** Built to test how execution would go. Not adopted: every choice here is pending team review and may be discarded.

The canonical Tetherless content model, its validator, and an importer that turns
RCO's quiz files into that model.

The learner app, the sync server and the scoring engine all read **one** JSON
shape. Every input format is converted into that shape here, so a new input
format never touches the app or the server.

## Requirements

Node.js **22.18 or later** (runs TypeScript directly). No `npm install` needed
to run the importer or the tests. `typescript` and `@types/node` are listed only
for the optional `npm run typecheck`.

## Use

```sh
cd packages/content

# Kahoot spreadsheet (Spanish / English in one cell)
node src/cli.ts quiz.xlsx \
  --module-id pr-bootcamp-security-tools --content-version 1 \
  --title-en "Security Tools Basics" \
  --title-es "Conceptos básicos de herramientas de seguridad"

# Next version of the same module: keeps IDs stable, retires removed questions
node src/cli.ts quiz-edited.xlsx --module-id pr-bootcamp-security-tools \
  --content-version 2 --title-en "Security Tools Basics" \
  --previous pr-bootcamp-security-tools.v1.json

# Tetherless CSV template, or canonical JSON
node src/cli.ts templates/tetherless-template.csv --module-id example --content-version 1 --title-en "Example"
node src/cli.ts module.json --dry-run
```

The output file is written **only when there are no errors**. Every problem is
listed at once with its row and column, e.g.

```
ERROR [MULTIPLE_CORRECT_NOT_SUPPORTED] (row 6, Correct answer(s)): Correct answer "1,2" marks more than one answer. ...
```

Exit codes: `0` valid, `1` the file has errors, `2` the command was used incorrectly.

```sh
node --test "test/**/*.test.ts"   # or: npm test
```

## Supported inputs

| Input | How it is read |
|---|---|
| `.json` | Canonical module, validated as is |
| `.csv` | Tetherless template (`templates/tetherless-template.csv`) or a Kahoot sheet saved as CSV. Comma, semicolon and tab separators are detected |
| `.xlsx` | Kahoot quiz spreadsheet, first sheet. Instruction rows above the header are skipped |

## Canonical model (schema_version 1)

```jsonc
{
  "schema_version": 1,
  "module_id": "pr-bootcamp-security-tools",
  "content_version": 1,                       // whole number, only goes up
  "title": { "en": "…", "es": "…" },          // es is optional everywhere
  "topics": [{ "topic_id": "firewalls", "name": { "en": "Firewalls" } }],  // optional; a branch of the progress tree
  "retired_question_ids": [],                 // removed IDs, never reused
  "questions": [{
    "question_id": "pr-bootcamp-security-tools-q01",
    "type": "multiple_choice",
    "topic": "firewalls",                     // optional until RCO confirms topics
    "term": { "en": "Firewall" },             // optional; a node on the progress tree
    "prompt": { "en": "What does a firewall do?", "es": "¿Qué hace un firewall?" },
    "choices": [{ "choice_id": "a", "text": { "en": "…", "es": "…" } }],
    "correct_choice_id": "a",
    "explanation": { "en": "…" },             // optional
    "time_limit_sec": 60                      // optional
  }],
  "boss_missions": [{                         // optional; unlocked when a branch is complete
    "mission_id": "…-boss-firewalls", "topic": "firewalls",
    "title": { "en": "Traffic flood" }, "scenario": { "en": "Your school's lab is flooded with strange traffic…" },
    "questions": [ /* same shape as above; IDs share one namespace with all questions */ ]
  }],
  "source": { "format": "kahoot", "file_name": "quiz.xlsx" }
}
```

## Validation rules

- English text is required; Spanish is optional.
- Text is normalized to Unicode NFC; text garbled by a wrong encoding (`Ã©`) is an error.
- In Kahoot cells, `" / "` (with spaces) separates Spanish and English; `EDR/XDR` is left alone.
- `content_version` must increase; removed questions are retired and their IDs can never return.
- Answer-key or wording changes on an existing ID are warnings for a person to confirm.
- Kahoot re-imports reuse the previous ID when the English prompt matches, and keep topics,
  terms, explanations and Boss Missions from `--previous`.
- One correct answer per question.
- When `topics` is listed, every question and Boss Mission must use one of them.

Published modules live in `../../content/modules/`; `test/content-modules.test.ts`
checks every version there.

## Not in this package yet

Publishing to the server, upload endpoint, other activity types (matching,
sequence, puzzles), CSV export.
