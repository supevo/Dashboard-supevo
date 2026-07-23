#!/usr/bin/env bash
# =============================================================================
# Applies all SQL migrations in order against a (self-hosted) Supabase DB.
#
# Prerequisites:
#   - The Supabase stack is running and initialised (the `auth` and `storage`
#     schemas must already exist – migration 0004 references storage.*).
#   - psql is available and DATABASE_URL points at the Postgres instance, e.g.
#       export DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/postgres"
#
# Usage:  ./deploy/apply-migrations.sh
# =============================================================================
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../supabase/migrations"

echo "Applying migrations from ${MIGRATIONS_DIR} ..."
for file in $(ls "${MIGRATIONS_DIR}"/*.sql | sort); do
  echo "  -> $(basename "$file")"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${file}"
done
echo "All migrations applied successfully."
