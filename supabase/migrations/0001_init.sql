-- Site Data Desk: initial schema. Content tables are a derived index of vault/ (see ingest/sync.py).
-- All tables have RLS enabled with no policies: only the server (service role) reads or writes.

create extension if not exists vector;

create table if not exists documents (
  id text primary key,
  type text not null,
  title text not null,
  short text,
  project_id text,
  source_type text,
  doc_date date,
  fictional boolean not null default true,
  licence text,
  source_url text,
  pages int,
  meta jsonb not null default '{}',
  body text not null,
  content_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id text not null references documents(id) on delete cascade,
  ord int not null,
  corpus text not null check (corpus in ('standards', 'internal')),
  content text not null,
  page int,
  section text,
  thread_id text,
  project_id text,
  meta jsonb not null default '{}',
  embedding vector(384),
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  content_hash text not null,
  unique (doc_id, ord)
);
create index if not exists chunks_embedding_idx on chunks using hnsw (embedding vector_ip_ops);
create index if not exists chunks_fts_idx on chunks using gin (fts);
create index if not exists chunks_corpus_project_idx on chunks (corpus, project_id);

create table if not exists project_facts (
  project_id text not null,
  key text not null,
  value jsonb not null,
  source_doc text,
  primary key (project_id, key)
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  kind text not null default 'chat',
  query text,
  route text,
  route_overridden boolean not null default false,
  status text,
  config_version text,
  answer jsonb,
  ip_hash text,
  is_eval boolean not null default false,
  public_example boolean not null default false,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  jev_requests int not null default 0,
  cost_usd numeric not null default 0
);
create index if not exists runs_thread_idx on runs (thread_id, started_at desc);

create table if not exists trace_events (
  id bigserial primary key,
  run_id uuid not null references runs(id) on delete cascade,
  seq int not null,
  node text not null,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms int,
  status text,
  model text,
  input jsonb,
  output jsonb,
  jev jsonb,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  error text
);
create index if not exists trace_events_run_idx on trace_events (run_id, seq);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete set null,
  rating smallint,
  category text,
  comment text,
  triage jsonb,
  created_at timestamptz not null default now()
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text,
  diff text,
  rationale text,
  source_feedback uuid[] not null default '{}',
  eval_before jsonb,
  eval_after jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  git_sha text,
  config_version text,
  metrics jsonb not null,
  failures jsonb,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists quota (
  ip_hash text not null,
  day date not null,
  count int not null default 0,
  primary key (ip_hash, day)
);
create table if not exists global_counters (
  day date primary key,
  requests int not null default 0
);
create table if not exists insight_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null
);
create table if not exists embed_cache (
  hash text primary key,
  vec vector(384) not null,
  created_at timestamptz not null default now()
);

alter table documents enable row level security;
alter table chunks enable row level security;
alter table project_facts enable row level security;
alter table runs enable row level security;
alter table trace_events enable row level security;
alter table feedback enable row level security;
alter table proposals enable row level security;
alter table eval_runs enable row level security;
alter table quota enable row level security;
alter table global_counters enable row level security;
alter table insight_cache enable row level security;
alter table embed_cache enable row level security;

-- Hybrid search: vector + full-text, fused with Reciprocal Rank Fusion (k = 60).
-- fts_query is an OR-joined tsquery string built in application code (stopwords and symbols removed).
create or replace function hybrid_search(
  q_emb vector(384),
  fts_query text,
  corpora text[] default null,
  proj text default null,
  doc_filter text[] default null,
  k int default 30
)
returns table (
  id uuid, doc_id text, doc_title text, doc_short text, doc_type text, doc_date date, doc_fictional boolean,
  content text, page int, section text, corpus text, project_id text, thread_id text, meta jsonb,
  rrf double precision, vrank int, frank int
)
language sql stable
as $$
  with vec as (
    select c.id, row_number() over (order by c.embedding <#> q_emb) as r
    from chunks c
    where (corpora is null or c.corpus = any(corpora))
      and (proj is null or c.project_id = proj)
      and (doc_filter is null or c.doc_id = any(doc_filter))
    order by c.embedding <#> q_emb
    limit 60
  ),
  q as (select to_tsquery('english', nullif(fts_query, '')) as tsq),
  fts as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as r
    from chunks c, q
    where q.tsq is not null and c.fts @@ q.tsq
      and (corpora is null or c.corpus = any(corpora))
      and (proj is null or c.project_id = proj)
      and (doc_filter is null or c.doc_id = any(doc_filter))
    order by ts_rank_cd(c.fts, q.tsq) desc
    limit 60
  ),
  fused as (
    select coalesce(v.id, f.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) as rrf,
           v.r::int as vrank, f.r::int as frank
    from vec v full outer join fts f on v.id = f.id
  )
  select c.id, c.doc_id, d.title, d.short, d.type, d.doc_date, d.fictional,
         c.content, c.page, c.section, c.corpus, c.project_id, c.thread_id, c.meta,
         fused.rrf, fused.vrank, fused.frank
  from fused
  join chunks c on c.id = fused.id
  join documents d on d.id = c.doc_id
  order by fused.rrf desc
  limit k;
$$;

-- Atomic per-IP and global daily quota. Returns allowed=false (and does not count) when a limit is hit.
create or replace function consume_quota(p_ip text, p_limit int, p_global int)
returns table (allowed boolean, used int, global_used int)
language plpgsql
as $$
declare
  d date := (now() at time zone 'utc')::date;
  g int;
  u int;
begin
  insert into global_counters(day, requests) values (d, 0) on conflict (day) do nothing;
  insert into quota(ip_hash, day, count) values (p_ip, d, 0) on conflict (ip_hash, day) do nothing;
  select requests into g from global_counters where day = d for update;
  select count into u from quota where ip_hash = p_ip and day = d for update;
  if g >= p_global or u >= p_limit then
    return query select false, u, g;
    return;
  end if;
  update global_counters set requests = requests + 1 where day = d;
  update quota set count = count + 1 where ip_hash = p_ip and day = d;
  return query select true, u + 1, g + 1;
end;
$$;

-- Retention helpers (called by the nightly workflow through /api/maintenance).
create or replace function prune_old_data(trace_days int default 30, cache_days int default 7)
returns void
language plpgsql
as $$
begin
  delete from runs where started_at < now() - make_interval(days => trace_days) and not public_example;
  delete from embed_cache where created_at < now() - make_interval(days => cache_days);
  delete from insight_cache where expires_at < now();
  delete from quota where day < (now() at time zone 'utc')::date - 3;
  delete from global_counters where day < (now() at time zone 'utc')::date - 30;
end;
$$;

-- Keep-alive target so the free project is not paused for inactivity.
create or replace function ping() returns text language sql stable as $$ select 'ok'::text $$;
