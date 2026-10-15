#!/usr/bin/env sh
# Restore a backup made by scripts/backup.sh. Replaces the current data.
#   scripts/restore.sh backups/tetherless-2026-10-15-020000.dump
set -eu
file="${1:?Give the backup file to restore}"
[ -f "$file" ] || { echo "No such file: $file"; exit 1; }
printf 'This replaces all data in the running database with %s. Type RESTORE to continue: ' "$file"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
docker compose stop api
docker compose exec -T db pg_restore -U tetherless -d tetherless --clean --if-exists --no-owner < "$file"
docker compose start api
echo "Restored $file"
