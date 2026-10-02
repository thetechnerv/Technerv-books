-- 0070 — activity summaries also pick up file names (CSV imports, documents)
-- and money-movement kinds, so Recent activity never shows a blank label.
create or replace function accounts.log_activity() returns trigger
language plpgsql security definer set search_path = accounts as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v_summary text;
begin
  v_summary := coalesce(r ->> 'number', r ->> 'vendor', r ->> 'display_name', r ->> 'title', r ->> 'file_name',
                        r ->> 'name', r ->> 'source', r ->> 'description',
                        case when r ? 'kind' and r ? 'amount' then (r ->> 'kind') || ' ' || (r ->> 'amount') end);
  insert into activity_log (member_id, entity_type, entity_id, action, summary)
  values (accounts.current_member_id(), tg_table_name, (r ->> 'id')::uuid, lower(tg_op), v_summary);
  return null;
end $$;

update accounts.activity_log a set summary = b.file_name
from accounts.import_batches b
where a.entity_type = 'import_batches' and a.entity_id = b.id and a.summary is null;
