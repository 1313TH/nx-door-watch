begin;

create or replace function public.moderate_case_atomic(
  p_vehicle_id uuid,
  p_action text,
  p_note text default null
)
returns table (
  public_case_id text,
  moderation_status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_current_status text;
  v_public_case_id text;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if p_action not in (
    'approved',
    'needs_revision',
    'rejected'
  ) then
    raise exception 'Invalid moderation action';
  end if;

  select
    v.public_case_id,
    v.moderation_status
  into
    v_public_case_id,
    v_current_status
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.deleted_at is null
    and v.archived_at is null
  for update;

  if not found then
    raise exception 'Case not found';
  end if;

  if v_current_status not in (
    'pending',
    'approved',
    'needs_revision'
  ) then
    raise exception
      'Case cannot be moderated. Current status: %',
      v_current_status;
  end if;

  update public.vehicles
  set
    moderation_status = p_action,
    updated_at = now()
  where id = p_vehicle_id;

  -- 主案件與第 1 筆紀錄同步狀態。
  -- 後續紀錄仍各自獨立審核，不受影響。
  update public.incidents
  set
    moderation_status = p_action,
    updated_at = now()
  where vehicle_id = p_vehicle_id
    and incident_number = 1;

  insert into public.moderation_logs (
    vehicle_id,
    revision_id,
    admin_id,
    action,
    note
  )
  values (
    p_vehicle_id,
    null,
    v_admin_id,
    p_action,
    nullif(trim(p_note), '')
  );

  return query
  select
    v_public_case_id,
    p_action;
end;
$$;

commit;
