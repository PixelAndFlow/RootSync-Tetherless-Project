#!/usr/bin/env sh
# Back up the Tetherless database to backups/ (compressed custom format).
#   scripts/backup.sh
# Run it from cron, e.g. daily: 0 2 * * * cd /path/to/RootSync-Tetherless-Project && scripts/backup.sh
set -eu
mkdir -p backups
file="backups/tetherless-$(date +%Y-%m-%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U tetherless -d tetherless -Fc > "$file"
echo "Wrote $file ($(wc -c < "$file") bytes)"
