-- Full-text search runs over search_text (content plus a de-glued copy, e.g. "Arsenic2" -> "Arsenic 2"), so table
-- rows with footnote markers are findable. The stored content stays verbatim for quote checking.
alter table chunks add column if not exists search_text text;
drop index if exists chunks_fts_idx;
alter table chunks drop column if exists fts;
alter table chunks add column fts tsvector generated always as (to_tsvector('english', coalesce(search_text, content))) stored;
create index chunks_fts_idx on chunks using gin (fts);
