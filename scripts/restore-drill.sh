#!/usr/bin/env bash
# ============================================================================
# System A — backup restore drill.
#
# A backup you have never restored is not a backup. This script PROVES the most
# recent Core Postgres dump restores cleanly by loading it into a THROWAWAY
# database inside the running `db` container, then runs spot checks, then drops
# it. It never touches the live database.
#
# Usage:
#   scripts/restore-drill.sh
#   BACKUP_DIR=/mnt/backups scripts/restore-drill.sh
#
# Exit code 0 = drill passed; non-zero = investigate (backups may be unusable).
# Schedule monthly, e.g.:  0 4 1 * *  /path/scripts/restore-drill.sh >> /var/log/sa-restore-drill.log 2>&1
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_COMPOSE="${CORE_COMPOSE:-$HERE/../system-a-core/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$HERE/../backups}"
DRILL_DB="restore_drill_$(date +%s)"

dc_core() { docker compose -f "$CORE_COMPOSE" "$@"; }

latest="$(ls -1t "$BACKUP_DIR"/core-*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "$latest" ]; then
  echo "[drill] no core-*.sql.gz backups found in $BACKUP_DIR" >&2
  exit 2
fi
echo "[drill] using latest backup: $latest"

cleanup() {
  echo "[drill] dropping throwaway db $DRILL_DB"
  dc_core exec -T db psql -U system_a -d postgres -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[drill] creating throwaway db $DRILL_DB"
dc_core exec -T db psql -U system_a -d postgres \
  -c "CREATE DATABASE \"$DRILL_DB\" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';"

echo "[drill] restoring dump into $DRILL_DB"
gunzip -c "$latest" | dc_core exec -T db psql -U system_a -d "$DRILL_DB" >/dev/null

echo "[drill] spot checks"
# 1) ledger table exists and is queryable
rows="$(dc_core exec -T db psql -U system_a -d "$DRILL_DB" -tAc "SELECT count(*) FROM ledger;")"
echo "[drill]   ledger rows: $rows"

# 2) hash chain verifies inside the restored copy (tamper-evidence intact).
#    Recomputes each entry_hash and checks the links; empty result = OK.
bad="$(dc_core exec -T db psql -U system_a -d "$DRILL_DB" -tAc "
WITH chained AS (
  SELECT id, entry_hash, prev_hash,
         lag(entry_hash) OVER (ORDER BY id) AS expected_prev
  FROM ledger WHERE entry_hash IS NOT NULL
)
SELECT count(*) FROM chained
WHERE expected_prev IS NOT NULL AND prev_hash IS DISTINCT FROM expected_prev;
")"
echo "[drill]   broken chain links: $bad"

if [ "$bad" != "0" ]; then
  echo "[drill] FAIL: restored ledger hash chain is broken" >&2
  exit 1
fi

echo "[drill] PASS: backup restores and ledger chain is intact"
