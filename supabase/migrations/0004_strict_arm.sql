-- Third retrieval arm: strict AND query over the distinctive query words. The OR arm matches most of the corpus for
-- natural-language questions; the strict arm pulls numbers-only table rows ("Lead 300 1200 600 1 500") that the
-- vector arm cannot see.
drop function if exists hybrid_search(vector, text, text[], text, text[], int);
create or replace function hybrid_search(
  q_emb vector(384),
  fts_query text,
  corpora text[] default null,
  proj text default null,
  doc_filter text[] default null,
  k int default 30,
  fts_strict text default ''
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
  q as (select to_tsquery('english', nullif(fts_query, '')) as tsq, to_tsquery('english', nullif(fts_strict, '')) as tsq2),
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
  strict as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq2) desc) as r
    from chunks c, q
    where q.tsq2 is not null and c.fts @@ q.tsq2
      and (corpora is null or c.corpus = any(corpora))
      and (proj is null or c.project_id = proj)
      and (doc_filter is null or c.doc_id = any(doc_filter))
    order by ts_rank_cd(c.fts, q.tsq2) desc
    limit 40
  ),
  ids as (select id from vec union select id from fts union select id from strict),
  fused as (
    select i.id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + f.r), 0) + coalesce(1.0 / (60 + s.r), 0) as rrf,
           v.r::int as vrank, f.r::int as frank
    from ids i
    left join vec v on v.id = i.id
    left join fts f on f.id = i.id
    left join strict s on s.id = i.id
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
