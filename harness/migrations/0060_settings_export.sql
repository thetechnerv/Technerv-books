-- 0060 — Settings: list the app's tables so "Export everything" always covers
-- every table in the accounts schema, including ones added by later migrations.
create or replace function accounts.export_tables() returns setof text
language sql stable security invoker set search_path = accounts as $$
  select c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'accounts' and c.relkind in ('r', 'p')
  order by c.relname;
$$;

revoke execute on function accounts.export_tables() from public, anon;
grant execute on function accounts.export_tables() to authenticated, service_role;
