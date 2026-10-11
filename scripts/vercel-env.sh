#!/usr/bin/env bash
# Push the variables the deployed app needs from ./.env to the linked Vercel project (production).
# Run `cd web && vercel link` first. Review the list below; secrets are sent to YOUR Vercel project only.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
for name in OPENROUTER_API_KEY OPENROUTER_MODEL TYPESAFE_API_KEY JEV_MODEL SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
            SUPABASE_DB_URL IP_HASH_SALT EVAL_KEY EMBED_MODEL EMBED_DIMENSIONS DAILY_QUOTA_PER_IP GLOBAL_DAILY_CAP MAX_JEV_REQUESTS_PER_QUERY APP_URL; do
  val="${!name:-}"
  if [ -z "$val" ]; then echo "skip $name (empty)"; continue; fi
  (cd web && printf '%s' "$val" | vercel env add "$name" production --force >/dev/null) && echo "set $name"
done
