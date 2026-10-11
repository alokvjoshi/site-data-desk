#!/usr/bin/env bash
# One-time Supabase setup: apply the database migrations (uses the session pooler string in .env).
# Needs: `supabase login`, then `supabase link --project-ref <ref>` (it asks for the database password).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
supabase db push --db-url "$SUPABASE_DB_URL"
echo "Done. Next: make standards seed sync"
