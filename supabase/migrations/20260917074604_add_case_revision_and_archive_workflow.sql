begin;

-- =========================================================
-- 1. vehicles：補正式封存資訊
-- =========================================================

alter table public.vehicles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text;

create index if not exists vehicles_archived_at_idx
  on public.vehicles (archived_at);


-- =========================================================
-- 2. case_revisions：讓修改申請支援要求修改 + 審核人
-- =========================================================

alter table public.case_revisions
  add column if not exists reviewed_by uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.case_revisions
  drop constraint if exists case_revisions_status_check;

alter table public.case_revisions
  add constraint case_revisions_status_check
  check (
    status in (
      'pending',
      'needs_revision',
      'approved',
      'rejected'
    )
  );

create index if not exists case_revisions_vehicle_id_idx
  on public.case_revisions (vehicle_id);

create index if not exists case_revisions_status_idx
  on public.case_revisions (status);


-- =========================================================
-- 3. 下架 / 封存申請
-- =========================================================

create table if not exists public.case_archive_requests (
  id uuid primary key default gen_random_uuid(),

  vehicle_id uuid not null
    references public.vehicles(id)
    on delete cascade,

  submitted_by uuid not null,

  reason text not null,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'approved',
        'rejected'
      )
    ),

  admin_note text,

  reviewed_by uuid,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.case_archive_requests
  enable row level security;

create index if not exists case_archive_requests_vehicle_id_idx
  on public.case_archive_requests(vehicle_id);

create index if not exists case_archive_requests_status_idx
  on public.case_archive_requests(status);


-- =========================================================
-- 4. 防止同一案件同時存在多筆待審下架申請
-- =========================================================

create unique index if not exists case_archive_requests_one_pending_per_vehicle
  on public.case_archive_requests(vehicle_id)
  where status = 'pending';


-- =========================================================
-- 5. RLS：case_archive_requests
-- =========================================================

drop policy if exists case_archive_requests_select_owner
  on public.case_archive_requests;

create policy case_archive_requests_select_owner
on public.case_archive_requests
for select
to authenticated
using (
  submitted_by = auth.uid()
);

drop policy if exists case_archive_requests_select_admin
  on public.case_archive_requests;

create policy case_archive_requests_select_admin
on public.case_archive_requests
for select
to authenticated
using (
  public.is_admin()
);

-- 不開放 client 直接 insert/update/delete
-- 所有寫入走 SECURITY DEFINER RPC


-- =========================================================
-- 6. RPC：建立已公開案件修改申請
-- =========================================================

create or replace function public.request_case_revision(
  p_vehicle_id uuid,
  p_proposed_data jsonb
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
  v_revision_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select owner_id, moderation_status
    into v_owner_id, v_status
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

  if v_status <> 'approved' then
    raise exception 'Only approved cases require revision request';
  end if;

  if p_proposed_data is null
     or jsonb_typeof(p_proposed_data) <> 'object' then
    raise exception 'Invalid proposed data';
  end if;

  if exists (
    select 1
    from public.case_revisions r
    where r.vehicle_id = p_vehicle_id
      and r.target_type = 'vehicle'
      and r.status in ('pending', 'needs_revision')
  ) then
    raise exception 'An active revision request already exists';
  end if;

  insert into public.case_revisions (
    vehicle_id,
    submitted_by,
    target_type,
    target_id,
    proposed_data,
    status
  )
  values (
    p_vehicle_id,
    v_user_id,
    'vehicle',
    p_vehicle_id,
    p_proposed_data,
    'pending'
  )
  returning id into v_revision_id;

  return v_revision_id;
end;
$$;

revoke all on function public.request_case_revision(uuid, jsonb)
from public, anon;

grant execute on function public.request_case_revision(uuid, jsonb)
to authenticated;


-- =========================================================
-- 7. RPC：車主重新送出 needs_revision 修改申請
-- =========================================================

create or replace function public.resubmit_case_revision(
  p_revision_id uuid,
  p_proposed_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.case_revisions
  set
    proposed_data = p_proposed_data,
    status = 'pending',
    admin_note = null,
    reviewed_at = null,
    reviewed_by = null,
    updated_at = now()
  where id = p_revision_id
    and submitted_by = v_user_id
    and status = 'needs_revision';

  if not found then
    raise exception 'Revision request not found or cannot be resubmitted';
  end if;
end;
$$;

revoke all on function public.resubmit_case_revision(uuid, jsonb)
from public, anon;

grant execute on function public.resubmit_case_revision(uuid, jsonb)
to authenticated;


-- =========================================================
-- 8. RPC：Admin 審核修改申請
-- =========================================================

create or replace function public.review_case_revision(
  p_revision_id uuid,
  p_action text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_revision public.case_revisions%rowtype;
  v_model text;
  v_model_year integer;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if p_action not in (
    'approve',
    'needs_revision',
    'reject'
  ) then
    raise exception 'Invalid action';
  end if;

  select *
    into v_revision
  from public.case_revisions
  where id = p_revision_id
  for update;

  if not found then
    raise exception 'Revision request not found';
  end if;

  if v_revision.target_type <> 'vehicle' then
    raise exception 'Unsupported revision target';
  end if;

  if v_revision.status not in ('pending', 'needs_revision') then
    raise exception 'Revision request already reviewed';
  end if;

  if p_action = 'approve' then

    v_model := nullif(v_revision.proposed_data ->> 'model', '');
    v_model_year :=
      nullif(v_revision.proposed_data ->> 'model_year', '')::integer;

    if v_model is null or v_model_year is null then
      raise exception 'Revision data missing required fields';
    end if;

    update public.vehicles
    set
      model = v_model,
      model_year = v_model_year,
      updated_at = now()
    where id = v_revision.vehicle_id
      and archived_at is null;

    if not found then
      raise exception 'Vehicle not found';
    end if;

    update public.case_revisions
    set
      status = 'approved',
      admin_note = p_admin_note,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
    where id = p_revision_id;

  elsif p_action = 'needs_revision' then

    update public.case_revisions
    set
      status = 'needs_revision',
      admin_note = p_admin_note,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
    where id = p_revision_id;

  else

    update public.case_revisions
    set
      status = 'rejected',
      admin_note = p_admin_note,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
    where id = p_revision_id;

  end if;

  insert into public.moderation_logs (
    vehicle_id,
    revision_id,
    admin_id,
    action,
    note
  )
  values (
    v_revision.vehicle_id,
    p_revision_id,
    v_admin_id,
    'case_revision_' || p_action,
    p_admin_note
  );
end;
$$;

revoke all on function public.review_case_revision(uuid, text, text)
from public, anon;

grant execute on function public.review_case_revision(uuid, text, text)
to authenticated;


-- =========================================================
-- 9. RPC：車主申請下架
-- =========================================================

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

  select owner_id, moderation_status
    into v_owner_id, v_status
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

  if v_status <> 'approved' then
    raise exception 'Only approved cases can request archive';
  end if;

  if exists (
    select 1
    from public.case_archive_requests
    where vehicle_id = p_vehicle_id
      and status = 'pending'
  ) then
    raise exception 'An archive request is already pending';
  end if;

  insert into public.case_archive_requests (
    vehicle_id,
    submitted_by,
    reason
  )
  values (
    p_vehicle_id,
    v_user_id,
    trim(p_reason)
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.request_case_archive(uuid, text)
from public, anon;

grant execute on function public.request_case_archive(uuid, text)
to authenticated;


-- =========================================================
-- 10. RPC：Admin 審核下架申請
-- =========================================================

create or replace function public.review_case_archive(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_request public.case_archive_requests%rowtype;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if p_action not in ('approve', 'reject') then
    raise exception 'Invalid action';
  end if;

  select *
    into v_request
  from public.case_archive_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Archive request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Archive request already reviewed';
  end if;

  if p_action = 'approve' then

    update public.vehicles
    set
      archived_at = now(),
      archived_by = v_admin_id,
      archive_reason = v_request.reason,
      updated_at = now()
    where id = v_request.vehicle_id
      and archived_at is null;

    if not found then
      raise exception 'Vehicle already archived or not found';
    end if;

    update public.case_archive_requests
    set
      status = 'approved',
      admin_note = p_admin_note,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
    where id = p_request_id;

  else

    update public.case_archive_requests
    set
      status = 'rejected',
      admin_note = p_admin_note,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
    where id = p_request_id;

  end if;

  insert into public.moderation_logs (
    vehicle_id,
    admin_id,
    action,
    note
  )
  values (
    v_request.vehicle_id,
    v_admin_id,
    'case_archive_' || p_action,
    coalesce(p_admin_note, v_request.reason)
  );
end;
$$;

revoke all on function public.review_case_archive(uuid, text, text)
from public, anon;

grant execute on function public.review_case_archive(uuid, text, text)
to authenticated;


-- =========================================================
-- 11. RPC：Admin 恢復封存案件
-- =========================================================

create or replace function public.restore_archived_case(
  p_vehicle_id uuid,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  update public.vehicles
  set
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    updated_at = now()
  where id = p_vehicle_id
    and archived_at is not null;

  if not found then
    raise exception 'Archived case not found';
  end if;

  insert into public.moderation_logs (
    vehicle_id,
    admin_id,
    action,
    note
  )
  values (
    p_vehicle_id,
    v_admin_id,
    'case_archive_restore',
    p_admin_note
  );
end;
$$;

revoke all on function public.restore_archived_case(uuid, text)
from public, anon;

grant execute on function public.restore_archived_case(uuid, text)
to authenticated;

commit;

-- =========================================================
-- 12. RPC：車主修改 pending / needs_revision 主案件
-- =========================================================

create or replace function public.update_editable_case(
  p_vehicle_id uuid,
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
  p_quoted_amount integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_owner_id uuid;
  v_vehicle_status text;
  v_first_incident_id uuid;
  v_incident_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    owner_id,
    moderation_status
  into
    v_owner_id,
    v_vehicle_status
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

  if v_vehicle_status not in (
    'pending',
    'needs_revision'
  ) then
    raise exception 'Published case cannot be edited directly';
  end if;

  if p_model not in (
    'NX200',
    'NX250',
    'NX350',
    'NX350h',
    'NX450h+'
  ) then
    raise exception 'Invalid model';
  end if;

  if p_model_year < 2022
     or p_model_year > 2026 then
    raise exception 'Invalid model year';
  end if;

  if p_mileage is null
     or p_mileage < 0
     or p_mileage > 1000000 then
    raise exception 'Invalid mileage';
  end if;

  if p_door_positions is null
     or cardinality(p_door_positions) = 0 then
    raise exception 'At least one door position is required';
  end if;

  if p_symptoms is null
     or cardinality(p_symptoms) = 0 then
    raise exception 'At least one symptom is required';
  end if;

  if p_occurrence_frequency not in (
    'first_time',
    'two_to_three',
    'repeated'
  ) then
    raise exception 'Invalid occurrence frequency';
  end if;

  if p_repair_status not in (
    'not_visited',
    'waiting_inspection',
    'observe',
    'no_fault_code',
    'waiting_parts',
    'parts_arrived',
    'repair_scheduled',
    'repaired_warranty',
    'repaired_goodwill',
    'repaired_self_paid',
    'completed',
    'other'
  ) then
    raise exception 'Invalid repair status';
  end if;

  if p_has_quote = false then
    p_quoted_amount := null;
  end if;

  if p_quoted_amount is not null
     and p_quoted_amount < 0 then
    raise exception 'Invalid quoted amount';
  end if;

  select
    id,
    moderation_status
  into
    v_first_incident_id,
    v_incident_status
  from public.incidents
  where vehicle_id = p_vehicle_id
    and incident_number = 1
  for update;

  if not found then
    raise exception 'Primary incident not found';
  end if;

  if v_incident_status not in (
    'pending',
    'needs_revision'
  ) then
    raise exception 'Primary incident cannot be edited directly';
  end if;

  update public.vehicles
  set
    model = p_model,
    model_year = p_model_year,
    moderation_status = 'pending',
    updated_at = now()
  where id = p_vehicle_id;

  update public.incidents
  set
    mileage = p_mileage,
    incident_date = p_incident_date,
    door_positions = p_door_positions,
    symptoms = p_symptoms,
    occurrence_frequency = p_occurrence_frequency,
    dealer_visited = p_dealer_visited,
    has_work_order = p_has_work_order,
    repair_status = p_repair_status,
    has_quote = p_has_quote,
    quoted_amount = p_quoted_amount,
    moderation_status = 'pending',
    updated_at = now()
  where id = v_first_incident_id;
end;
$$;

revoke all on function public.update_editable_case(
  uuid,
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
  integer
)
from public, anon;

grant execute on function public.update_editable_case(
  uuid,
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
  integer
)
to authenticated;

