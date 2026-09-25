#!/usr/bin/env bash
# ============================================================================
# System A + Meridian — database backup.
#
# Backs up every stateful store to a timestamped, gzipped file under BACKUP_DIR:
#   • Core Postgres        (compose service "db",          DB system_a_core)
#   • Frontend Postgres    (compose service "frontend-db", DB frontend_db)
#   • GRM SQLite           (compose service "grm",         /app/data/grm.db)
#   • Meridian Postgres    (compose service "meridian-db", DB meridian) — optional
#
# Uses `docker compose exec` so it runs against the live containers without
# exposing ports. Postgres dumps use pg_dump (logical, restorable); the GRM
# SQLite file is copied consistently via the sqlite3 .backup command.
#
# Usage:
#   scripts/backup.sh                       # backs up System A stack
#   BACKUP_DIR=/mnt/backups scripts/backup.sh
#   MERIDIAN_COMPOSE=../external-app/docker-compose.yml scripts/backup.sh
#
# Retention: files older than BACKUP_RETENTION_DAYS (default 14) are pruned.
# Schedule from cron, e.g.:  0 3 * * *  /path/scripts/backup.sh >> /var/log/sa-backup.log 2>&1
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_COMPOSE="${CORE_COMPOSE:-$HERE/../system-a-core/docker-compose.yml}"
MERIDIAN_COMPOSE="${MERIDIAN_COMPOSE:-$HERE/../../external-app/docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$HERE/../backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
echo "[backup] target dir: $BACKUP_DIR (stamp $STAMP)"

dc_core() { docker compose -f "$CORE_COMPOSE" "$@"; }
dc_meri() { docker compose -f "$MERIDIAN_COMPOSE" "$@"; }

# --- Core Postgres ----------------------------------------------------------
if dc_core ps db >/dev/null 2>&1; then
  echo "[backup] core postgres → core-$STAMP.sql.gz"
  dc_core exec -T db pg_dump -U system_a system_a_core | gzip > "$BACKUP_DIR/core-$STAMP.sql.gz"
else
  echo "[backup] SKIP core postgres (service 'db' not running)"
fi

# --- Frontend Postgres ------------------------------------------------------
if dc_core ps frontend-db >/dev/null 2>&1; then
  echo "[backup] frontend postgres → frontend-$STAMP.sql.gz"
  dc_core exec -T frontend-db pg_dump -U frontend frontend_db | gzip > "$BACKUP_DIR/frontend-$STAMP.sql.gz"
else
  echo "[backup] SKIP frontend postgres (service 'frontend-db' not running)"
fi

# --- GRM SQLite -------------------------------------------------------------
if dc_core ps grm >/dev/null 2>&1; then
  echo "[backup] grm sqlite → grm-$STAMP.db.gz"
  # Consistent online backup via sqlite3 .backup, streamed out and gzipped.
  dc_core exec -T grm sh -c "sqlite3 /app/data/grm.db \".backup '/tmp/grm-backup.db'\" && cat /tmp/grm-backup.db && rm -f /tmp/grm-backup.db" \
    | gzip > "$BACKUP_DIR/grm-$STAMP.db.gz"
else
  echo "[backup] SKIP grm sqlite (service 'grm' not running)"
fi

# --- Meridian Postgres (optional; separate compose) -------------------------
if [ -f "$MERIDIAN_COMPOSE" ] && dc_meri ps meridian-db >/dev/null 2>&1; then
  echo "[backup] meridian postgres → meridian-$STAMP.sql.gz"
  dc_meri exec -T meridian-db pg_dump -U meridian meridian | gzip > "$BACKUP_DIR/meridian-$STAMP.sql.gz"
else
  echo "[backup] SKIP meridian postgres (compose or service not found)"
fi

# --- Retention --------------------------------------------------------------
echo "[backup] pruning backups older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR" -type f -name '*.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true

echo "[backup] done."
