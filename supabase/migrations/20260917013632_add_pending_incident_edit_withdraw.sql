-- =========================================================
-- NX Door Watch
-- Pending incident edit / withdraw workflow
-- =========================================================

-- ---------------------------------------------------------
-- 1. Allow withdrawn as an incident moderation state
-- ---------------------------------------------------------

alter table public.incidents
drop constraint if exists incidents_moderation_status_check;

alter table public.incidents
add constraint incidents_moderation_status_check
check (
  moderation_status = any (
    array[
      'pending'::text,
      'approved'::text,
      'needs_revision'::text,
      'rejected'::text,
      'withdrawn'::text
    ]
  )
);


-- ---------------------------------------------------------
-- 2. Owner may edit an incident ONLY while it is pending
-- ---------------------------------------------------------

create or replace function public.update_pending_incident_atomic(
  p_incident_id uuid,
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
  v_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    v.owner_id,
    i.moderation_status
  into
    v_owner_id,
    v_status
  from public.incidents i
  join public.vehicles v
    on v.id = i.vehicle_id
  where i.id = p_incident_id
    and v.deleted_at is null
  for update of i;

  if not found then
    raise exception 'Incident not found';
  end if;

  if v_owner_id <> v_user_id then
    raise exception 'Permission denied';
  end if;

  if v_status <> 'pending' then
    raise exception 'Only pending incidents can be edited';
  end if;

  if p_mileage is null or p_mileage < 0 then
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

  if not p_has_quote then
    p_quoted_amount := null;
  end if;

  if p_quoted_amount is not null
     and p_quoted_amount < 0 then
    raise exception 'Invalid quoted amount';
  end if;

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
    updated_at = now()
  where id = p_incident_id
    and moderation_status = 'pending';
end;
$$;

revoke all
on function public.update_pending_incident_atomic(
  uuid,
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
from public;

grant execute
on function public.update_pending_incident_atomic(
  uuid,
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


-- ---------------------------------------------------------
-- 3. Owner may withdraw an incident ONLY while it is pending
--    Keep the row for history; do not delete it.
-- ---------------------------------------------------------

create or replace function public.withdraw_pending_incident_atomic(
  p_incident_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
  v_owner_id uuid;
  v_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    v.owner_id,
    i.moderation_status
  into
    v_owner_id,
    v_status
  from public.incidents i
  join public.vehicles v
    on v.id = i.vehicle_id
  where i.id = p_incident_id
    and v.deleted_at is null
  for update of i;

  if not found then
    raise exception 'Incident not found';
  end if;

  if v_owner_id <> v_user_id then
    raise exception 'Permission denied';
  end if;

  if v_status <> 'pending' then
    raise exception 'Only pending incidents can be withdrawn';
  end if;

  update public.incidents
  set
    moderation_status = 'withdrawn',
    updated_at = now()
  where id = p_incident_id
    and moderation_status = 'pending';
end;
$$;

revoke all
on function public.withdraw_pending_incident_atomic(uuid)
from public;

grant execute
on function public.withdraw_pending_incident_atomic(uuid)
to authenticated;


-- ---------------------------------------------------------
-- 4. Harden admin moderation against stale forms/races.
--    An admin may moderate ONLY a currently pending incident.
-- ---------------------------------------------------------

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
  v_new_status text;
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
  for update of i;

  if not found then
    raise exception 'Incident not found';
  end if;

  if v_current_status <> 'pending' then
    raise exception 'Incident is no longer pending';
  end if;

  update public.incidents
  set
    moderation_status = p_action,
    updated_at = now()
  where id = p_incident_id
    and moderation_status = 'pending';

  v_new_status := p_action;

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
    p_note
  );

  return query
  select
    v_public_case_id,
    v_incident_number,
    v_new_status;
end;
$$;

revoke all
on function public.moderate_incident_atomic(
  uuid,
  text,
  text
)
from public;

grant execute
on function public.moderate_incident_atomic(
  uuid,
  text,
  text
)
to authenticated;
