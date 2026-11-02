# RootSync-Tetherless-Project

Code repo for Tetherless, a cyberathlete training PWA built for RCO
via Pursuit.org. See `README.md` for project overview, `ARCHITECTURE.md`
for the current (decided and built) technical state, and `FEATURES.md`
for what the app can actually do today. Private planning lives in
`RootSync-Tetherless-Project-Docs`.

## Keep FEATURES.md current

`FEATURES.md` is a living capability list, not a changelog. Any PR
that adds, removes, or materially changes a user-facing capability
(learner, trainer, or staff) must update the relevant bullet in the
same PR — move it out of "Known gaps" if it just shipped, don't leave
stale "not yet built" claims sitting next to the real thing. Bump its
"Last updated" date whenever you touch it.

## Git commit policy

This repo's commits carry **no AI co-author trailer** (no
`Co-Authored-By: Claude ...` line), consistent with this team's
standing practice on other repos (see `noisetosignal`'s and
`noisetosignal-docs`' CLAUDE.md). Before committing, check the
message doesn't have one.

## Public-repo awareness

This repo is expected to be visible at Pursuit Demo Day and
potentially stay public afterward. See
`RootSync-Tetherless-Project-Docs/governance/public-repo-sanitization-policy.md`
for what belongs here vs. in the private docs repo.
