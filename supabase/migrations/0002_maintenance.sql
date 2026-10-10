-- Prunes LangGraph checkpoint rows for conversations idle longer than `days`.
-- Tables are created by PostgresSaver.setup() on first use, so existence is checked at run time.
create or replace function prune_checkpoints(days int default 2) returns int
language plpgsql
as $$
declare
  stale text[];
  n int := 0;
  t text;
begin
  select coalesce(array_agg(thread_id), '{}') into stale
  from (select thread_id from runs group by thread_id having max(started_at) < now() - make_interval(days => days)) s;
  foreach t in array array['checkpoint_writes', 'checkpoint_blobs', 'checkpoints'] loop
    if to_regclass(t) is not null then
      execute format('delete from %I where thread_id = any($1)', t) using stale;
      get diagnostics n = row_count;
    end if;
  end loop;
  return coalesce(array_length(stale, 1), 0);
end;
$$;
