#!/usr/bin/env sh
# Run every package's tests. Needs Node 22.18+; no npm install required.
#   scripts/test-all.sh
# Server tests use an in-memory store unless TEST_DATABASE_URL or TEST_PSQL_HOST is set.
set -eu
cd "$(dirname "$0")/.."
for pkg in contract content analytics server; do
  echo "== packages/$pkg"
  (cd "packages/$pkg" && node --test "test/**/*.test.ts")
done
echo "== game build"
node prototypes/block-the-threat/build.mjs
