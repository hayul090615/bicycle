-- 익명 방문 UUID와 최초·최근 방문 시각, 방문 횟수를 기록하는 서버용 테이블이다.
create table if not exists public.site_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visits bigint not null default 1
);

-- 브라우저의 anon/authenticated 역할은 직접 접근하지 못하고 서버 service_role만 사용한다.
alter table public.site_visitors enable row level security;
revoke all on public.site_visitors from anon, authenticated;
grant select, insert, update on public.site_visitors to service_role;

-- 최초 방문은 삽입하고 재방문은 횟수를 올린다. 반환값 true는 이전 방문 기록이 있다는 뜻이다.
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
