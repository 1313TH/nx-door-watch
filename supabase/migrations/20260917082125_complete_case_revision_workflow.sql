begin;

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
  v_incident_id uuid;

  v_model text;
  v_model_year integer;

  v_mileage integer;
  v_incident_date date;
  v_door_positions text[];
  v_symptoms text[];
  v_occurrence_frequency text;
  v_dealer_visited boolean;
  v_has_work_order boolean;
  v_repair_status text;
  v_has_quote boolean;
  v_quoted_amount integer;
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

  if v_revision.status not in (
    'pending',
    'needs_revision'
  ) then
    raise exception 'Revision request already reviewed';
  end if;

  if p_action = 'approve' then

    v_model :=
      nullif(v_revision.proposed_data ->> 'model', '');

    v_model_year :=
      nullif(
        v_revision.proposed_data ->> 'model_year',
        ''
      )::integer;

    v_mileage :=
      nullif(
        v_revision.proposed_data ->> 'mileage',
        ''
      )::integer;

    v_incident_date :=
      nullif(
        v_revision.proposed_data ->> 'incident_date',
        ''
      )::date;

    select coalesce(
      array_agg(value),
      array[]::text[]
    )
    into v_door_positions
    from jsonb_array_elements_text(
      coalesce(
        v_revision.proposed_data -> 'door_positions',
        '[]'::jsonb
      )
    );

    select coalesce(
      array_agg(value),
      array[]::text[]
    )
    into v_symptoms
    from jsonb_array_elements_text(
      coalesce(
        v_revision.proposed_data -> 'symptoms',
        '[]'::jsonb
      )
    );

    v_occurrence_frequency :=
      nullif(
        v_revision.proposed_data
          ->> 'occurrence_frequency',
        ''
      );

    v_dealer_visited :=
      coalesce(
        (
          v_revision.proposed_data
            ->> 'dealer_visited'
        )::boolean,
        false
      );

    v_has_work_order :=
      coalesce(
        (
          v_revision.proposed_data
            ->> 'has_work_order'
        )::boolean,
        false
      );

    v_repair_status :=
      nullif(
        v_revision.proposed_data
          ->> 'repair_status',
        ''
      );

    v_has_quote :=
      coalesce(
        (
          v_revision.proposed_data
            ->> 'has_quote'
        )::boolean,
        false
      );

    v_quoted_amount :=
      nullif(
        v_revision.proposed_data
          ->> 'quoted_amount',
        ''
      )::integer;

    if v_model is null
       or v_model_year is null
       or v_mileage is null
       or cardinality(v_door_positions) = 0
       or cardinality(v_symptoms) = 0
       or v_repair_status is null then
      raise exception 'Revision data missing required fields';
    end if;

    update public.vehicles
    set
      model = v_model,
      model_year = v_model_year,
      updated_at = now()
    where id = v_revision.vehicle_id
      and deleted_at is null
      and archived_at is null
      and moderation_status = 'approved';

    if not found then
      raise exception 'Vehicle not found or unavailable';
    end if;

    select id
    into v_incident_id
    from public.incidents
    where vehicle_id = v_revision.vehicle_id
      and incident_number = 1
    for update;

    if not found then
      raise exception 'Primary incident not found';
    end if;

    update public.incidents
    set
      mileage = v_mileage,
      incident_date = v_incident_date,
      door_positions = v_door_positions,
      symptoms = v_symptoms,
      occurrence_frequency =
        v_occurrence_frequency,
      dealer_visited = v_dealer_visited,
      has_work_order = v_has_work_order,
      repair_status = v_repair_status,
      has_quote = v_has_quote,
      quoted_amount =
        case
          when v_has_quote
            then v_quoted_amount
          else null
        end,
      updated_at = now()
    where id = v_incident_id;

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

revoke all on function public.review_case_revision(
  uuid,
  text,
  text
)
from public, anon;

grant execute on function public.review_case_revision(
  uuid,
  text,
  text
)
to authenticated;

commit;
