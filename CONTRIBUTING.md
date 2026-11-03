# Contributing

This is a Pursuit.org Builder team project. Current contributors:
Marc Delsoin, Chris Wozniak, Naquan Mckune.

## Workflow

1. Open an issue (or reference an existing one) before starting
   non-trivial work.
2. Branch off `main`.
3. Before opening a PR, run `scripts/test-all.sh` (everything that
   doesn't need a browser or a real device) locally — CI runs the
   full suite including Playwright, but catching failures before a
   PR saves a round trip.
4. Open a PR using the template in `.github/PULL_REQUEST_TEMPLATE.md`.
5. At least one other team member reviews before merge (enforced by
   branch protection on `main`).

## Commit messages

No AI co-author trailer — see `CLAUDE.md`.

## Where things live

See `README.md` for the current tech stack, project layout, and how
to run things locally, and `ARCHITECTURE.md` for how the pieces fit
together. Private planning (PRDs, decisions, test evidence) lives in
the separate `RootSync-Tetherless-Project-Docs` repo — reference the
relevant entry in its `decisions/README.md` when a change follows
from a decision made there.
