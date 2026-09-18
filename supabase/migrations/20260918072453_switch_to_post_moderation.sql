begin;

-- =========================================================
-- 1. 車輛建立後立即具有公開時間
-- pending = 已公開、等待管理員後審
-- approved = 已完成管理員審核
-- needs_revision / rejected = 不公開
-- =========================================================

create or replace function public.protect_vehicle_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if TG_OP = 'INSERT' then
    new.public_case_id := public.generate_nx_case_id();

    if new.moderation_status in ('pending', 'approved') then
      new.published_at :=
        coalesce(new.published_at, now());
    else
      new.published_at := null;
    end if;

    new.deleted_at := null;

    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;

  if new.public_case_id is distinct from old.public_case_id then
    raise exception 'public_case_id cannot be changed';
  end if;

  new.created_at := old.created_at;

  -- 首次進入公開狀態時記錄 published_at。
  -- 被要求修改時不清除原公開日期。
  if old.published_at is null
     and new.moderation_status in ('pending', 'approved') then
    new.published_at := now();
  else
    new.published_at := old.published_at;
  end if;

  if new.moderation_status = 'deleted'
     and old.moderation_status <> 'deleted' then
    new.deleted_at := now();
  else
    new.deleted_at := old.deleted_at;
  end if;

  return new;
end;
$$;


-- =========================================================
-- 2. 舊的待審案件現在依後審制立即公開
-- needs_revision / rejected 不受影響
-- =========================================================

update public.vehicles
set published_at = coalesce(published_at, created_at, now())
where moderation_status = 'pending'
  and deleted_at is null
  and published_at is null;


-- =========================================================
-- 3. 公開案件判定
-- pending 與 approved 都可公開
-- =========================================================

create or replace function public.is_public_vehicle(
  p_vehicle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.moderation_status in ('pending', 'approved')
      and v.published_at is not null
      and v.deleted_at is null
  );
$$;

revoke all
on function public.is_public_vehicle(uuid)
from public;

grant execute
on function public.is_public_vehicle(uuid)
to anon, authenticated;


create or replace function public.is_public_unarchived_vehicle(
  p_vehicle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.moderation_status in ('pending', 'approved')
      and v.published_at is not null
      and v.deleted_at is null
      and v.archived_at is null
  );
$$;

revoke all
on function public.is_public_unarchived_vehicle(uuid)
from public;

grant execute
on function public.is_public_unarchived_vehicle(uuid)
to anon, authenticated;


-- =========================================================
-- 4. Public RLS
-- pending = 已公開待後審
-- approved = 已審核
-- needs_revision / rejected = 隱藏
-- =========================================================

drop policy if exists "vehicles_public_select_approved"
on public.vehicles;

drop policy if exists vehicles_public_select_visible
on public.vehicles;

create policy vehicles_public_select_visible
on public.vehicles
for select
to anon, authenticated
using (
  moderation_status in ('pending', 'approved')
  and published_at is not null
  and deleted_at is null
  and archived_at is null
);


drop policy if exists "incidents_public_select_approved"
on public.incidents;

drop policy if exists incidents_public_select_visible
on public.incidents;

create policy incidents_public_select_visible
on public.incidents
for select
to anon, authenticated
using (
  moderation_status in ('pending', 'approved')
  and public.is_public_unarchived_vehicle(vehicle_id)
);


-- =========================================================
-- 5. Admin 案件後審
--
-- pending        = 已公開、待審
-- approved       = 已審核、公開
-- needs_revision = 暫時隱藏、要求修改
-- rejected       = 隱藏
--
-- 不再把整台車全部 incidents 一起改成 needs_revision，
-- 避免後續紀錄全部被誤鎖。
-- =========================================================

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

  -- 初次審核通過時，只同步第一筆主紀錄。
  -- 後續紀錄仍各自進行後審。
  if p_action = 'approved' then
    update public.incidents
    set
      moderation_status = 'approved',
      updated_at = now()
    where vehicle_id = p_vehicle_id
      and incident_number = 1
      and moderation_status = 'pending';
  end if;

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


-- =========================================================
-- 6. Admin 後續紀錄後審
-- 允許對已公開紀錄再次要求修改
-- =========================================================

create or replace function public.moderate_incident_atomic(
  p_incident_id uuid,
  p_action text,
  p_note text default null
)
returns table (
  public_case_id text,
  incident_number integer,
  new_status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_vehicle_id uuid;
  v_public_case_id text;
  v_incident_number integer;
  v_current_status text;
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
    i.vehicle_id,
    i.incident_number,
    i.moderation_status,
    v.public_case_id
  into
    v_vehicle_id,
    v_incident_number,
    v_current_status,
    v_public_case_id
  from public.incidents i
  join public.vehicles v
    on v.id = i.vehicle_id
  where i.id = p_incident_id
    and v.deleted_at is null
  for update of i;

  if not found then
    raise exception 'Incident not found';
  end if;

  if v_current_status not in (
    'pending',
    'approved',
    'needs_revision'
  ) then
    raise exception
      'Incident cannot be moderated. Current status: %',
      v_current_status;
  end if;

  update public.incidents
  set
    moderation_status = p_action,
    updated_at = now()
  where id = p_incident_id;

  insert into public.moderation_logs (
    vehicle_id,
    incident_id,
    admin_id,
    action,
    note
  )
  values (
    v_vehicle_id,
    p_incident_id,
    v_admin_id,
    p_action,
    nullif(trim(p_note), '')
  );

  return query
  select
    v_public_case_id,
    v_incident_number,
    p_action;
end;
$$;


-- =========================================================
-- 7. 車主看到案件層級的 Admin 修改要求
-- =========================================================

create or replace function public.get_case_feedback(
  p_vehicle_id uuid
)
returns table (
  action text,
  note text,
  created_at timestamptz
)
language plpgsql
stable
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
  ) then
    raise exception 'Permission denied';
  end if;

  return query
  select
    ml.action,
    ml.note,
    ml.created_at
  from public.moderation_logs ml
  where ml.vehicle_id = p_vehicle_id
    and ml.incident_id is null
    and ml.revision_id is null
    and ml.action in (
      'needs_revision',
      'rejected'
    )
  order by ml.created_at desc
  limit 1;
end;
$$;

revoke all
on function public.get_case_feedback(uuid)
from public, anon;

grant execute
on function public.get_case_feedback(uuid)
to authenticated;


-- =========================================================
-- 8. pending / needs_revision 車主修正
-- 修正完成即重新公開並回到待後審
-- 同時修掉舊的年式 2022~2026 限制
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
    raise exception 'Case cannot be edited directly';
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

  if p_model_year < 2015
     or p_model_year > 2030 then
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

  if p_occurrence_frequency is not null
     and p_occurrence_frequency not in (
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

  if not p_has_quote then
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

commit;
