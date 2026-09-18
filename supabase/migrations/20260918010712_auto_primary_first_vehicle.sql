begin;

create or replace function public.create_case_atomic (
  p_model                text,
  p_model_year           integer,
  p_mileage              integer,
  p_incident_date        date,
  p_door_positions       text[],
  p_symptoms             text[],
  p_occurrence_frequency text,
  p_dealer_visited       boolean,
  p_has_work_order       boolean,
  p_repair_status        text,
  p_has_quote            boolean,
  p_quoted_amount        integer
)
returns table (
  vehicle_id     uuid,
  public_case_id text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_user_id uuid;
  v_vehicle_id uuid;
  v_case_id text;
  v_make_primary boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- 如果這個帳號目前沒有有效車輛，
  -- 第一台自動成為主要車輛。
  select not exists (
    select 1
    from public.vehicles
    where owner_id = v_user_id
      and deleted_at is null
  )
  into v_make_primary;

  v_case_id := public.generate_nx_case_id();

  insert into public.vehicles (
    owner_id,
    public_case_id,
    model,
    model_year,
    moderation_status,
    is_primary
  )
  values (
    v_user_id,
    v_case_id,
    p_model,
    p_model_year,
    'pending',
    v_make_primary
  )
  returning id into v_vehicle_id;

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
    case
      when p_has_quote then p_quoted_amount
      else null
    end,
    'pending'
  );

  return query
  select v_vehicle_id, v_case_id;
end;
$function$;

revoke all
on function public.create_case_atomic(
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
from public;

grant execute
on function public.create_case_atomic(
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

commit;
