begin;

create or replace function public.admin_archive_case(
  p_vehicle_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_status text;
  v_request_id uuid;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Archive reason is required';
  end if;

  select moderation_status into v_status
  from public.vehicles
  where id = p_vehicle_id
    and deleted_at is null
    and archived_at is null
  for update;

  if not found then
    raise exception 'Vehicle not found or already archived';
  end if;

  if v_status not in ('pending', 'approved') then
    raise exception 'Case is not currently public';
  end if;

  update public.vehicles
  set archived_at = now(), archived_by = v_admin_id, archive_reason = trim(p_reason), updated_at = now()
  where id = p_vehicle_id and archived_at is null;

  if not found then
    raise exception 'Vehicle already archived or not found';
  end if;

  select id into v_request_id
  from public.case_archive_requests
  where vehicle_id = p_vehicle_id and status = 'pending'
  for update;

  if v_request_id is not null then
    update public.case_archive_requests
    set status = 'approved',
        admin_note = '管理員直接下架：' || trim(p_reason),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    where id = v_request_id;
  end if;

  insert into public.moderation_logs (vehicle_id, admin_id, action, note)
  values (p_vehicle_id, v_admin_id, 'case_archive_admin_direct', trim(p_reason));
end;
$$;

revoke all on function public.admin_archive_case(uuid, text) from public, anon;
grant execute on function public.admin_archive_case(uuid, text) to authenticated;

commit;
