begin;

-- 舊的「準備反映」不再保留
delete from public.case_reports
where status = 'planned';

-- 移除「其他正式管道」
delete from public.case_reports
where channel = 'other';

alter table public.case_reports
drop constraint if exists case_reports_status_check;

alter table public.case_reports
add constraint case_reports_status_check
check (
  status in (
    'submitted',
    'completed'
  )
);

alter table public.case_reports
drop constraint if exists case_reports_channel_check;

alter table public.case_reports
add constraint case_reports_channel_check
check (
  channel in (
    'lexus',
    'vehicle_safety',
    'consumer_protection',
    '1950',
    'motc_mailbox'
  )
);

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
    'motc_mailbox'
  ) then
    raise exception 'Invalid channel';
  end if;

  if p_status not in (
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
    coalesce(p_reported_at, current_date),
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

commit;
