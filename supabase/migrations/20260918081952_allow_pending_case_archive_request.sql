begin;

create or replace function public.request_case_archive(
  p_vehicle_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_owner_id uuid;
  v_status text;
  v_request_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Archive reason is required';
  end if;

  select
    owner_id,
    moderation_status
  into
    v_owner_id,
    v_status
  from public.vehicles
  where id = p_vehicle_id
    and deleted_at is null
    and archived_at is null
  for update;

  if not found then
    raise exception 'Vehicle not found';
  end if;

  if v_owner_id <> v_user_id then
    raise exception 'Permission denied';
  end if;

  -- 後審制：pending 與 approved 都已經是公開案件
  if v_status not in ('pending', 'approved') then
    raise exception 'Case is not currently public';
  end if;

  if exists (
    select 1
    from public.case_archive_requests
    where vehicle_id = p_vehicle_id
      and status = 'pending'
  ) then
    raise exception 'An active archive request already exists';
  end if;

  insert into public.case_archive_requests (
    vehicle_id,
    requested_by,
    reason,
    status
  )
  values (
    p_vehicle_id,
    v_user_id,
    trim(p_reason),
    'pending'
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all
on function public.request_case_archive(uuid, text)
from public, anon;

grant execute
on function public.request_case_archive(uuid, text)
to authenticated;

commit;
