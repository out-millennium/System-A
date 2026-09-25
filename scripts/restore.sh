#!/usr/bin/env bash
# ============================================================================
# System A + Meridian — restore from a backup produced by scripts/backup.sh.
#
# Restores a SINGLE store from a gzipped dump. This is destructive for the
# target database — run deliberately.
#
# Usage:
#   scripts/restore.sh core     backups/core-YYYYMMDD-HHMMSS.sql.gz
#   scripts/restore.sh frontend backups/frontend-YYYYMMDD-HHMMSS.sql.gz
#   scripts/restore.sh meridian backups/meridian-YYYYMMDD-HHMMSS.sql.gz
#   scripts/restore.sh grm      backups/grm-YYYYMMDD-HHMMSS.db.gz
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_COMPOSE="${CORE_COMPOSE:-$HERE/../system-a-core/docker-compose.yml}"
MERIDIAN_COMPOSE="${MERIDIAN_COMPOSE:-$HERE/../../external-app/docker-compose.yml}"

TARGET="${1:-}"
FILE="${2:-}"
if [ -z "$TARGET" ] || [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "usage: $0 <core|frontend|meridian|grm> <backup-file.gz>" >&2
  exit 1
fi

dc_core() { docker compose -f "$CORE_COMPOSE" "$@"; }
dc_meri() { docker compose -f "$MERIDIAN_COMPOSE" "$@"; }

echo "[restore] restoring $TARGET from $FILE"
case "$TARGET" in
  core)
    gunzip -c "$FILE" | dc_core exec -T db psql -U system_a -d system_a_core
    ;;
  frontend)
    gunzip -c "$FILE" | dc_core exec -T frontend-db psql -U frontend -d frontend_db
    ;;
  meridian)
    gunzip -c "$FILE" | dc_meri exec -T meridian-db psql -U meridian -d meridian
    ;;
  grm)
    # Replace the SQLite file in the grm volume, then restart grm.
    gunzip -c "$FILE" | dc_core exec -T grm sh -c "cat > /app/data/grm.db"
    dc_core restart grm
    ;;
  *)
    echo "unknown target: $TARGET" >&2; exit 1 ;;
esac

echo "[restore] done."
