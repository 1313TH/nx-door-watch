begin;

-- =========================================================
-- 主要車輛
-- UX 預設一帳號一台主要車，但資料層仍允許多車
-- =========================================================

alter table public.vehicles
add column if not exists is_primary boolean not null default false;

-- 每個 owner 最多一台 primary
create unique index if not exists vehicles_one_primary_per_owner
on public.vehicles(owner_id)
where is_primary = true
  and deleted_at is null;

-- 既有資料：每位使用者挑最早建立的一台作為主要車
with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by created_at asc, id asc
    ) as rn
  from public.vehicles
  where deleted_at is null
)
update public.vehicles v
set is_primary = true
from ranked r
where v.id = r.id
  and r.rn = 1
  and not exists (
    select 1
    from public.vehicles existing
    where existing.owner_id = v.owner_id
      and existing.is_primary = true
      and existing.deleted_at is null
  );


-- =========================================================
-- 正式反映 / 申訴管道
-- =========================================================

create table if not exists public.case_reports (
  id uuid primary key default gen_random_uuid(),

  vehicle_id uuid not null
    references public.vehicles(id)
    on delete cascade,

  submitted_by uuid not null
    references auth.users(id)
    on delete cascade,

  channel text not null
    check (
      channel in (
        'lexus',
        'vehicle_safety',
        'consumer_protection',
        '1950',
        'motc_mailbox',
        'other'
      )
    ),

  status text not null
    check (
      status in (
        'planned',
        'submitted',
        'completed'
      )
    ),

  reported_at date null,

  -- 私人欄位：只限 owner / admin
  reference_number text null,
  note text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(vehicle_id, channel)
);

create index if not exists case_reports_vehicle_id_idx
on public.case_reports(vehicle_id);

create index if not exists case_reports_channel_status_idx
on public.case_reports(channel, status);

alter table public.case_reports enable row level security;


-- =========================================================
-- SELECT RLS
-- owner 可看自己的
-- admin 可看全部
-- public 不直接讀這張表
-- =========================================================

drop policy if exists case_reports_select_owner
on public.case_reports;

create policy case_reports_select_owner
on public.case_reports
for select
to authenticated
using (
  exists (
    select 1
    from public.vehicles v
    where v.id = case_reports.vehicle_id
      and v.owner_id = auth.uid()
  )
);

drop policy if exists case_reports_select_admin
on public.case_reports;

create policy case_reports_select_admin
on public.case_reports
for select
to authenticated
using (
  public.is_admin()
);


-- 不開放 direct INSERT / UPDATE / DELETE
revoke all
on table public.case_reports
from anon;

revoke insert, update, delete
on table public.case_reports
from authenticated;

grant select
on table public.case_reports
to authenticated;


-- =========================================================
-- Owner RPC：新增 / 更新自己的通報狀態
-- =========================================================

create or replace function public.upsert_case_report(
  p_vehicle_id uuid,
  p_channel text,
  p_status text,
  p_reported_at date default null,
  p_reference_number text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_report_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_channel not in (
    'lexus',
    'vehicle_safety',
    'consumer_protection',
    '1950',
    'motc_mailbox',
    'other'
  ) then
    raise exception 'Invalid channel';
  end if;

  if p_status not in (
    'planned',
    'submitted',
    'completed'
  ) then
    raise exception 'Invalid status';
  end if;

  if not exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.owner_id = v_user_id
      and v.deleted_at is null
  ) then
    raise exception 'Vehicle not owned by current user';
  end if;

  insert into public.case_reports (
    vehicle_id,
    submitted_by,
    channel,
    status,
    reported_at,
    reference_number,
    note
  )
  values (
    p_vehicle_id,
    v_user_id,
    p_channel,
    p_status,
    case
      when p_status in ('submitted', 'completed')
        then coalesce(p_reported_at, current_date)
      else null
    end,
    nullif(trim(p_reference_number), ''),
    nullif(trim(p_note), '')
  )
  on conflict (vehicle_id, channel)
  do update set
    status = excluded.status,
    reported_at = excluded.reported_at,
    reference_number = excluded.reference_number,
    note = excluded.note,
    updated_at = now()
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all
on function public.upsert_case_report(
  uuid,
  text,
  text,
  date,
  text,
  text
)
from public, anon;

grant execute
on function public.upsert_case_report(
  uuid,
  text,
  text,
  date,
  text,
  text
)
to authenticated;


-- =========================================================
-- Owner RPC：移除某管道狀態
-- =========================================================

create or replace function public.remove_case_report(
  p_vehicle_id uuid,
  p_channel text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.owner_id = auth.uid()
      and v.deleted_at is null
  ) then
    raise exception 'Vehicle not owned by current user';
  end if;

  delete from public.case_reports
  where vehicle_id = p_vehicle_id
    and channel = p_channel;
end;
$$;

revoke all
on function public.remove_case_report(uuid, text)
from public, anon;

grant execute
on function public.remove_case_report(uuid, text)
to authenticated;


-- =========================================================
-- 設定主要車輛
-- =========================================================

create or replace function public.set_primary_vehicle(
  p_vehicle_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.vehicles
    where id = p_vehicle_id
      and owner_id = auth.uid()
      and deleted_at is null
  ) then
    raise exception 'Vehicle not owned by current user';
  end if;

  update public.vehicles
  set is_primary = false
  where owner_id = auth.uid()
    and id <> p_vehicle_id;

  update public.vehicles
  set is_primary = true
  where id = p_vehicle_id
    and owner_id = auth.uid();
end;
$$;

revoke all
on function public.set_primary_vehicle(uuid)
from public, anon;

grant execute
on function public.set_primary_vehicle(uuid)
to authenticated;


-- =========================================================
-- 公開安全資料
-- 只回傳「已正式反映」的 channel
-- 絕不回傳 reference_number / note / email
-- =========================================================

create or replace function public.get_public_case_report_channels(
  p_vehicle_id uuid
)
returns table (
  channel text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select distinct cr.channel
  from public.case_reports cr
  where cr.vehicle_id = p_vehicle_id
    and cr.status in ('submitted', 'completed')
    and public.is_public_unarchived_vehicle(p_vehicle_id);
$$;

revoke all
on function public.get_public_case_report_channels(uuid)
from public;

grant execute
on function public.get_public_case_report_channels(uuid)
to anon, authenticated;


-- =========================================================
-- 公開 Dashboard 聚合
-- 每台車 + 每個 channel 只算一次
-- =========================================================

create or replace function public.get_public_reporting_summary()
returns table (
  public_case_count bigint,
  reported_case_count bigint,
  unreported_case_count bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with public_vehicles as (
    select v.id
    from public.vehicles v
    where public.is_public_unarchived_vehicle(v.id)
  ),
  reported as (
    select distinct cr.vehicle_id
    from public.case_reports cr
    join public_vehicles pv
      on pv.id = cr.vehicle_id
    where cr.status in ('submitted', 'completed')
  )
  select
    (select count(*) from public_vehicles),
    (select count(*) from reported),
    (
      (select count(*) from public_vehicles)
      -
      (select count(*) from reported)
    );
$$;

revoke all
on function public.get_public_reporting_summary()
from public;

grant execute
on function public.get_public_reporting_summary()
to anon, authenticated;


create or replace function public.get_public_reporting_channel_counts()
returns table (
  channel text,
  case_count bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    cr.channel,
    count(distinct cr.vehicle_id)::bigint
  from public.case_reports cr
  where cr.status in ('submitted', 'completed')
    and public.is_public_unarchived_vehicle(cr.vehicle_id)
  group by cr.channel
  order by count(distinct cr.vehicle_id) desc;
$$;

revoke all
on function public.get_public_reporting_channel_counts()
from public;

grant execute
on function public.get_public_reporting_channel_counts()
to anon, authenticated;

commit;
