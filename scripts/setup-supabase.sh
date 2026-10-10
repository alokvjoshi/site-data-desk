#!/usr/bin/env bash
# One-time Supabase setup: apply migrations, set the embed secret, deploy the embedding Edge Function.
# Needs: `supabase login`, then `supabase link --project-ref <ref>` (it asks for the database password).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
supabase db push
supabase secrets set "EMBED_SECRET=${EMBED_SECRET}"
supabase functions deploy embed
echo "Done. Next: make standards seed sync"
