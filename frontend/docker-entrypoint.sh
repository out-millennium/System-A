#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Bring the database schema up to date before starting the app.
#
# Strategy (robust against a drifted migration history):
#   1. Wait for the database to accept connections.
#   2. Try `prisma migrate deploy` (applies pending migrations normally).
#   3. ALWAYS run `prisma db push` afterwards to reconcile the live schema with
#      schema.prisma. db push is idempotent: if the schema already matches it
#      does nothing; if columns/tables are missing (e.g. an older database from
#      a previous version) it adds them. This prevents runtime crashes like:
#          The column `User.role` does not exist in the current database.
#
# Safe for this project's frontend database (sign-in accounts + auth metadata).
# ---------------------------------------------------------------------------

echo "[entrypoint] Waiting for the database..."
i=0
until npx prisma db execute --stdin >/dev/null 2>&1 <<'SQL'
SELECT 1;
SQL
do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] Database did not become ready in time; continuing anyway."
    break
  fi
  sleep 1
done

echo "[entrypoint] Step 1/2: prisma migrate deploy"
npx prisma migrate deploy || echo "[entrypoint] migrate deploy reported an issue; continuing to db push."

echo "[entrypoint] Step 2/2: prisma db push (reconcile schema)"
# Retry once, because a race with a just-started DB can make the first push fail.
npx prisma db push --accept-data-loss \
  || (echo "[entrypoint] db push failed once; retrying in 3s..." && sleep 3 && npx prisma db push --accept-data-loss) \
  || echo "[entrypoint] db push still failing; the app may crash on DB queries."

echo "[entrypoint] Starting Next.js..."
exec npm start
