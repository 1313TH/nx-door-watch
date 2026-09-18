begin;

create or replace function public.create_case_atomic(
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
  p_quoted_amount integer
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
  v_user_id uuid;
  v_vehicle_id uuid;
  v_public_case_id text;
  v_make_primary boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
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

  select not exists (
    select 1
    from public.vehicles existing
    where existing.owner_id = v_user_id
      and existing.deleted_at is null
  )
  into v_make_primary;

  insert into public.vehicles as new_vehicle (
    owner_id,
    public_case_id,
    model,
    model_year,
    moderation_status,
    is_primary
  )
  values (
    v_user_id,
    '',
    p_model,
    p_model_year,
    'pending',
    v_make_primary
  )
  returning
    new_vehicle.id,
    new_vehicle.public_case_id
  into
    v_vehicle_id,
    v_public_case_id;

  insert into public.incidents (
    vehicle_id,
    incident_number,
    mileage,
    incident_date,
    door_positions,
    symptoms,
    occurrence_frequency,
    dealer_visited,
    has_work_order,
    repair_status,
    has_quote,
    quoted_amount,
    moderation_status
  )
  values (
    v_vehicle_id,
    1,
    p_mileage,
    p_incident_date,
    p_door_positions,
    p_symptoms,
    p_occurrence_frequency,
    p_dealer_visited,
    p_has_work_order,
    p_repair_status,
    p_has_quote,
    p_quoted_amount,
    'pending'
  );

  return query
  select
    v_vehicle_id,
    v_public_case_id;
end;
$$;

commit;
