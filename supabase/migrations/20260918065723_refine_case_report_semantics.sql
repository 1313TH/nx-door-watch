begin;

-- ---------------------------------------------------------
-- 1. case_reports 增加 withdrawn，保留歷史，不 hard delete
-- ---------------------------------------------------------

alter table public.case_reports
drop constraint if exists case_reports_status_check;

alter table public.case_reports
add constraint case_reports_status_check
check (
  status in (
    'submitted',
    'completed',
    'withdrawn'
  )
);

-- ---------------------------------------------------------
-- 2. 原 remove_case_report 改為 soft withdrawal
--    保留 reported_at / reference_number / note
-- ---------------------------------------------------------

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

  update public.case_reports
  set
    status = 'withdrawn',
    updated_at = now()
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

-- ---------------------------------------------------------
-- 3. 公開案例正式反映 Tag
--    1950 是諮詢，不列入正式反映
-- ---------------------------------------------------------

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
    and cr.channel <> '1950'
    and public.is_public_unarchived_vehicle(p_vehicle_id);
$$;

revoke all
on function public.get_public_case_report_channels(uuid)
from public;

grant execute
on function public.get_public_case_report_channels(uuid)
to anon, authenticated;

-- ---------------------------------------------------------
-- 4. 正式反映 KPI
--    1950 不計入正式反映率
-- ---------------------------------------------------------

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
      and cr.channel <> '1950'
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

-- ---------------------------------------------------------
-- 5. 公開正式反映管道統計
-- ---------------------------------------------------------

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
    and cr.channel <> '1950'
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
