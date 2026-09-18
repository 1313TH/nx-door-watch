begin;

-- =========================================================
-- 1. 建立案例 + 初始申訴/諮詢紀錄，全部同一 transaction
-- 任一 report 寫入失敗，整筆案件一起 rollback
-- =========================================================

create or replace function public.create_case_with_reports_atomic(
  p_model text,
  p_model_year integer,
  p_mileage integer,
  p_incident_date date,
  p_door_positions text[],
  p_symptoms text[],
  p_occurrence_frequency text,
  p_dealer_visited boolean,
  p_has_work_order boolean,
  p_repair_status text,
  p_has_quote boolean,
  p_quoted_amount integer,
  p_reports jsonb default '[]'::jsonb
)
returns table (
  vehicle_id uuid,
  public_case_id text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_created record;
  v_report jsonb;
  v_channel text;
  v_reported_at date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(coalesce(p_reports, '[]'::jsonb)) <> 'array' then
    raise exception 'p_reports must be a JSON array';
  end if;

  select *
  into v_created
  from public.create_case_atomic(
    p_model,
    p_model_year,
    p_mileage,
    p_incident_date,
    p_door_positions,
    p_symptoms,
    p_occurrence_frequency,
    p_dealer_visited,
    p_has_work_order,
    p_repair_status,
    p_has_quote,
    p_quoted_amount
  );

  if v_created.vehicle_id is null then
    raise exception 'Case creation failed';
  end if;

  for v_report in
    select value
    from jsonb_array_elements(
      coalesce(p_reports, '[]'::jsonb)
    )
  loop
    v_channel := nullif(
      trim(v_report ->> 'channel'),
      ''
    );

    if v_channel is null then
      continue;
    end if;

    if v_channel not in (
      'lexus',
      'vehicle_safety',
      'consumer_protection',
      '1950',
      'motc_mailbox'
    ) then
      raise exception 'Invalid report channel: %', v_channel;
    end if;

    begin
      v_reported_at :=
        nullif(v_report ->> 'reported_at', '')::date;
    exception
      when others then
        raise exception 'Invalid reported_at for channel %', v_channel;
    end;

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
      v_created.vehicle_id,
      auth.uid(),
      v_channel,
      'submitted',
      coalesce(v_reported_at, current_date),
      null,
      null
    )
    on conflict (vehicle_id, channel)
    do update set
      status = 'submitted',
      reported_at = excluded.reported_at,
      updated_at = now();
  end loop;

  return query
  select
    v_created.vehicle_id,
    v_created.public_case_id;
end;
$$;

revoke all
on function public.create_case_with_reports_atomic(
  text,
  integer,
  integer,
  date,
  text[],
  text[],
  text,
  boolean,
  boolean,
  text,
  boolean,
  integer,
  jsonb
)
from public, anon;

grant execute
on function public.create_case_with_reports_atomic(
  text,
  integer,
  integer,
  date,
  text[],
  text[],
  text,
  boolean,
  boolean,
  text,
  boolean,
  integer,
  jsonb
)
to authenticated;


-- =========================================================
-- 2. 公開 reporting batch RPC
-- 一次查多個案件，避免 N+1
-- 1950 屬諮詢，不列入正式反映 Tag/KPI
-- =========================================================

create or replace function public.get_public_case_report_channels_batch(
  p_vehicle_ids uuid[]
)
returns table (
  vehicle_id uuid,
  channel text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select distinct
    cr.vehicle_id,
    cr.channel
  from public.case_reports cr
  where cr.vehicle_id = any(
    coalesce(p_vehicle_ids, array[]::uuid[])
  )
    and cr.status in ('submitted', 'completed')
    and cr.channel <> '1950'
    and public.is_public_unarchived_vehicle(cr.vehicle_id)
  order by cr.vehicle_id, cr.channel;
$$;

revoke all
on function public.get_public_case_report_channels_batch(uuid[])
from public;

grant execute
on function public.get_public_case_report_channels_batch(uuid[])
to anon, authenticated;

commit;
