create table if not exists public.site_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visits bigint not null default 1
);

alter table public.site_visitors enable row level security;
revoke all on public.site_visitors from anon, authenticated;
grant select, insert, update on public.site_visitors to service_role;

create or replace function public.record_site_visit(p_visitor_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.site_visitors (visitor_id)
  values (p_visitor_id) on conflict (visitor_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    update public.site_visitors set last_seen_at = now(), visits = visits + 1
    where visitor_id = p_visitor_id;
  end if;
  return inserted_count = 0;
end;
$$;

revoke execute on function public.record_site_visit(uuid) from public, anon, authenticated;
grant execute on function public.record_site_visit(uuid) to service_role;
