SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE SEQUENCE "public"."nx_case_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."case_revisions" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_id"    uuid                     NOT NULL,
  "incident_id"   uuid,
  "submitted_by"  uuid                     NOT NULL,
  "target_type"   text                     NOT NULL,
  "target_id"     uuid,
  "proposed_data" jsonb                    NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'pending'::text,
  "admin_note"    text,
  "reviewed_at"   timestamp with time zone,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "case_revisions_pkey" PRIMARY KEY (id),
  CONSTRAINT "case_revisions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "case_revisions_target_type_check" CHECK ((target_type = ANY (ARRAY['vehicle'::text, 'incident'::text, 'timeline'::text])))
);

ALTER TABLE "public"."case_revisions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."government_actions" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_id"      uuid                     NOT NULL,
  "incident_id"     uuid,
  "action_type"     text                     NOT NULL,
  "action_status"   text                     NOT NULL DEFAULT 'not_started'::text,
  "action_date"     date,
  "reference_last4" character varying(4),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "government_actions_action_status_check" CHECK ((action_status = ANY (ARRAY['not_started'::text, 'submitted'::text, 'responded'::text, 'closed'::text]))),
  CONSTRAINT "government_actions_action_type_check"
    CHECK
    ((action_type = ANY (ARRAY['vehicle_safety_report'::text, 'consumer_complaint_first'::text, 'consumer_complaint_second'::text, 'consumer_mediation'::text,
    'lexus_customer_service'::text, 'motc_petition'::text]))),
  CONSTRAINT "government_actions_pkey" PRIMARY KEY (id),
  CONSTRAINT "government_actions_reference_last4_check" CHECK (((reference_last4 IS NULL) OR ((reference_last4)::text ~ '^[A-Za-z0-9]{1,4}$'::text)))
);

ALTER TABLE "public"."government_actions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."incidents" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_id"           uuid                     NOT NULL,
  "incident_number"      integer                  NOT NULL,
  "mileage"              integer                  NOT NULL,
  "incident_date"        date,
  "door_positions"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "symptoms"             text[]                   NOT NULL DEFAULT '{}'::text[],
  "occurrence_frequency" text,
  "dealer_visited"       boolean                  NOT NULL DEFAULT false,
  "has_work_order"       boolean                  NOT NULL DEFAULT false,
  "repair_status"        text                     NOT NULL DEFAULT 'not_visited'::text,
  "has_quote"            boolean                  NOT NULL DEFAULT false,
  "quoted_amount"        integer,
  "moderation_status"    text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "incidents_incident_number_check" CHECK ((incident_number >= 1)),
  CONSTRAINT "incidents_mileage_check" CHECK (((mileage >= 0) AND (mileage <= 1000000))),
  CONSTRAINT "incidents_moderation_status_check" CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'needs_revision'::text, 'rejected'::text]))),
  CONSTRAINT "incidents_occurrence_frequency_check"
    CHECK (((occurrence_frequency IS NULL) OR (occurrence_frequency = ANY (ARRAY['first_time'::text, 'two_to_three'::text, 'repeated'::text])))),
  CONSTRAINT "incidents_pkey" PRIMARY KEY (id),
  CONSTRAINT "incidents_quoted_amount_check" CHECK (((quoted_amount IS NULL) OR (quoted_amount >= 0))),
  CONSTRAINT "incidents_repair_status_check"
    CHECK
    ((repair_status = ANY (ARRAY['not_visited'::text, 'waiting_inspection'::text, 'no_fault_code'::text, 'observe'::text, 'waiting_parts'::text, 'parts_arrived'::text,
    'repair_scheduled'::text, 'repaired_warranty'::text, 'repaired_goodwill'::text, 'repaired_self_paid'::text, 'completed'::text, 'other'::text]))),
  CONSTRAINT "incidents_vehicle_id_incident_number_key" UNIQUE (vehicle_id, incident_number)
);

ALTER TABLE "public"."incidents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."moderation_logs" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_id"  uuid,
  "revision_id" uuid,
  "admin_id"    uuid                     NOT NULL,
  "action"      text                     NOT NULL,
  "note"        text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "incident_id" uuid,
  CONSTRAINT "moderation_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."moderation_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "role"       text                     NOT NULL DEFAULT 'user'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."timeline_events" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "vehicle_id"        uuid                     NOT NULL,
  "incident_id"       uuid,
  "event_type"        text                     NOT NULL,
  "event_date"        date                     NOT NULL,
  "description"       text,
  "source"            text                     NOT NULL DEFAULT 'owner'::text,
  "moderation_status" text                     NOT NULL DEFAULT 'approved'::text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "timeline_events_moderation_status_check" CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "timeline_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "timeline_events_source_check" CHECK ((source = ANY (ARRAY['owner'::text, 'admin'::text, 'system'::text])))
);

ALTER TABLE "public"."timeline_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."vehicles" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "owner_id"          uuid                     NOT NULL,
  "public_case_id"    text                     NOT NULL,
  "model"             text                     NOT NULL,
  "model_year"        integer                  NOT NULL,
  "moderation_status" text                     NOT NULL DEFAULT 'pending'::text,
  "published_at"      timestamp with time zone,
  "deleted_at"        timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vehicles_model_check" CHECK ((model = ANY (ARRAY['NX200'::text, 'NX250'::text, 'NX350'::text, 'NX350h'::text, 'NX450h+'::text]))),
  CONSTRAINT "vehicles_model_year_check" CHECK (((model_year >= 2022) AND (model_year <= 2026))),
  CONSTRAINT "vehicles_moderation_status_check"
    CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'needs_revision'::text, 'rejected'::text, 'deleted'::text]))),
  CONSTRAINT "vehicles_pkey" PRIMARY KEY (id),
  CONSTRAINT "vehicles_public_case_id_key" UNIQUE (public_case_id)
);

ALTER TABLE "public"."vehicles"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.add_incident_atomic (
  p_vehicle_id           uuid,
  p_mileage              integer,
  p_incident_date        date,
  p_door_positions       text[],
  p_symptoms             text[],
  p_occurrence_frequency text,
  p_dealer_visited       boolean,
  p_has_work_order       boolean,
  p_repair_status        text,
  p_has_quote            boolean,
  p_quoted_amount        integer DEFAULT NULL::integer
)
  RETURNS TABLE (
    incident_id     uuid,
    incident_number integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
declare
  v_user_id uuid;
  v_owner_id uuid;
  v_next_number integer;
  v_incident_id uuid;
begin
  -- 1. 必須登入
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- 2. 鎖定 vehicle。
  --    同一台車同時間只能有一個新增紀錄流程在計算流水號。
  select owner_id
  into v_owner_id
  from public.vehicles
  where id = p_vehicle_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Vehicle not found';
  end if;

  -- 3. 只能替自己的案件新增紀錄
  if v_owner_id <> v_user_id then
    raise exception 'Permission denied';
  end if;

  -- 4. 基本資料檢查
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

  if p_has_quote = false then
    p_quoted_amount := null;
  end if;

  if p_quoted_amount is not null
     and p_quoted_amount < 0 then
    raise exception 'Invalid quoted amount';
  end if;

  -- 5. 自動取得下一個 incident number
  select coalesce(max(i.incident_number), 0) + 1
  into v_next_number
  from public.incidents i
  where i.vehicle_id = p_vehicle_id;

  -- 6. 建立新的待審核紀錄
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
    p_vehicle_id,
    v_next_number,
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
  )
  returning id
  into v_incident_id;

  return query
  select
    v_incident_id,
    v_next_number;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_case_atomic (
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
  RETURNS TABLE (
    vehicle_id     uuid,
    public_case_id text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
declare
  v_user_id uuid;
  v_vehicle_id uuid;
  v_case_id text;
begin
  -- 必須是已登入使用者
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- 產生公開案件編號
  v_case_id := public.generate_nx_case_id();

  -- 建立車輛案件
  insert into public.vehicles (
    owner_id,
    public_case_id,
    model,
    model_year,
    moderation_status
  )
  values (
    v_user_id,
    v_case_id,
    p_model,
    p_model_year,
    'pending'
  )
  returning id into v_vehicle_id;

  -- 建立第一筆故障紀錄
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

CREATE OR REPLACE FUNCTION public.generate_nx_case_id()
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  select 'NX-' || lpad(nextval('public.nx_case_seq')::text, 4, '0');
$function$;

CREATE OR REPLACE FUNCTION public.get_incident_feedback (
  p_incident_id uuid
)
  RETURNS TABLE (
    action     text,
    note       text,
    created_at timestamp with time zone
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.incidents i
    join public.vehicles v
      on v.id = i.vehicle_id
    where i.id = p_incident_id
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
  where ml.incident_id = p_incident_id
    and ml.action in ('needs_revision', 'rejected')
  order by ml.created_at desc
  limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_cases()
  RETURNS TABLE (
    public_case_id           text,
    model                    text,
    model_year               integer,
    incident_number          integer,
    mileage                  integer,
    incident_date            date,
    door_positions           text[],
    symptoms                 text[],
    occurrence_frequency     text,
    dealer_visited           boolean,
    has_work_order           boolean,
    repair_status            text,
    has_quote                boolean,
    quoted_amount            integer,
    vehicle_safety_reported  boolean,
    consumer_complaint_stage text,
    published_at             timestamp with time zone,
    updated_at               timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  select
    v.public_case_id,
    v.model,
    v.model_year,

    i.incident_number,
    i.mileage,
    i.incident_date,

    i.door_positions,
    i.symptoms,
    i.occurrence_frequency,

    i.dealer_visited,
    i.has_work_order,

    i.repair_status,
    i.has_quote,
    i.quoted_amount,

    exists (
      select 1
      from public.government_actions ga
      where ga.vehicle_id = v.id
        and ga.action_type = 'vehicle_safety_report'
        and ga.action_status in ('submitted', 'responded', 'closed')
    ) as vehicle_safety_reported,

    case
      when exists (
        select 1
        from public.government_actions ga
        where ga.vehicle_id = v.id
          and ga.action_type = 'consumer_mediation'
          and ga.action_status in ('submitted', 'responded', 'closed')
      ) then 'mediation'

      when exists (
        select 1
        from public.government_actions ga
        where ga.vehicle_id = v.id
          and ga.action_type = 'consumer_complaint_second'
          and ga.action_status in ('submitted', 'responded', 'closed')
      ) then 'second_complaint'

      when exists (
        select 1
        from public.government_actions ga
        where ga.vehicle_id = v.id
          and ga.action_type = 'consumer_complaint_first'
          and ga.action_status in ('submitted', 'responded', 'closed')
      ) then 'first_complaint'

      else 'none'
    end as consumer_complaint_stage,

    v.published_at,
    greatest(v.updated_at, i.updated_at) as updated_at

  from public.vehicles v

  join public.incidents i
    on i.vehicle_id = v.id

  where
    v.moderation_status = 'approved'
    and v.deleted_at is null
    and i.moderation_status = 'approved'

  order by
    greatest(v.updated_at, i.updated_at) desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_dashboard_summary()
  RETURNS TABLE (
    vehicle_case_count          bigint,
    incident_count              bigint,
    work_order_case_count       bigint,
    vehicle_safety_report_count bigint,
    consumer_complaint_count    bigint,
    multi_door_case_count       bigint,
    completed_repair_count      bigint,
    latest_update               timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  with approved_vehicles as (
    select
      v.id,
      v.updated_at
    from public.vehicles v
    where
      v.moderation_status = 'approved'
      and v.deleted_at is null
  ),

  approved_incidents as (
    select
      i.*
    from public.incidents i

    join approved_vehicles v
      on v.id = i.vehicle_id

    where
      i.moderation_status = 'approved'
  ),

  incident_stats as (
    select
      i.vehicle_id,

      count(*) as approved_incident_count,

      bool_or(
        cardinality(i.door_positions) > 1
      ) as has_multi_door_incident,

      bool_or(
        i.has_work_order
      ) as has_work_order,

      bool_or(
        i.repair_status in (
          'repaired_warranty',
          'repaired_goodwill',
          'repaired_self_paid',
          'completed'
        )
      ) as repair_completed,

      max(i.updated_at) as latest_incident_update

    from approved_incidents i

    group by i.vehicle_id
  ),

  government_stats as (
    select
      ga.vehicle_id,

      bool_or(
        ga.action_type = 'vehicle_safety_report'
        and ga.action_status in (
          'submitted',
          'responded',
          'closed'
        )
      ) as vehicle_safety_reported,

      bool_or(
        ga.action_type in (
          'consumer_complaint_first',
          'consumer_complaint_second',
          'consumer_mediation'
        )
        and ga.action_status in (
          'submitted',
          'responded',
          'closed'
        )
      ) as consumer_complaint_submitted,

      max(ga.updated_at) as latest_government_update

    from public.government_actions ga

    join approved_vehicles v
      on v.id = ga.vehicle_id

    group by ga.vehicle_id
  )

  select

    (
      select count(*)
      from approved_vehicles
    ) as vehicle_case_count,

    (
      select count(*)
      from approved_incidents
    ) as incident_count,

    (
      select count(*)
      from incident_stats
      where has_work_order = true
    ) as work_order_case_count,

    (
      select count(*)
      from government_stats
      where vehicle_safety_reported = true
    ) as vehicle_safety_report_count,

    (
      select count(*)
      from government_stats
      where consumer_complaint_submitted = true
    ) as consumer_complaint_count,

    (
      select count(*)
      from incident_stats
      where
        approved_incident_count > 1
        or has_multi_door_incident = true
    ) as multi_door_case_count,

    (
      select count(*)
      from incident_stats
      where repair_completed = true
    ) as completed_repair_count,

    greatest(
      coalesce(
        (
          select max(updated_at)
          from approved_vehicles
        ),
        '-infinity'::timestamptz
      ),

      coalesce(
        (
          select max(latest_incident_update)
          from incident_stats
        ),
        '-infinity'::timestamptz
      ),

      coalesce(
        (
          select max(latest_government_update)
          from government_stats
        ),
        '-infinity'::timestamptz
      )
    ) as latest_update;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_public_vehicle (
  p_vehicle_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.moderation_status = 'approved'
      and v.published_at is not null
      and v.deleted_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.moderate_case_atomic (
  p_vehicle_id uuid,
  p_action     text,
  p_note       text DEFAULT NULL::text
)
  RETURNS TABLE (
    public_case_id    text,
    moderation_status text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
declare
  v_admin_id uuid;
  v_is_admin boolean;
  v_current_status text;
  v_public_case_id text;
  v_target_status text;
begin
  -- 1. 必須登入
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'Authentication required';
  end if;

  -- 2. 再次從資料庫確認是真正的 admin
  select exists (
    select 1
    from public.profiles
    where id = v_admin_id
      and role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'Admin permission required';
  end if;

  -- 3. 限制只有三種合法操作
  v_target_status :=
    case p_action
      when 'approved' then 'approved'
      when 'needs_revision' then 'needs_revision'
      when 'rejected' then 'rejected'
      else null
    end;

  if v_target_status is null then
    raise exception 'Invalid moderation action';
  end if;

  -- 4. 鎖定案件，避免兩個管理員同時審核
  select
    v.public_case_id,
    v.moderation_status
  into
    v_public_case_id,
    v_current_status
  from public.vehicles v
  where v.id = p_vehicle_id
    and v.deleted_at is null
  for update;

  if not found then
    raise exception 'Case not found';
  end if;

  -- 第一版只允許 pending 案件進行審核
  if v_current_status <> 'pending' then
    raise exception
      'Case has already been moderated. Current status: %',
      v_current_status;
  end if;

  -- 5. 更新主案件
  update public.vehicles
  set
    moderation_status = v_target_status,
    published_at = case
      when v_target_status = 'approved' then now()
      else null
    end,
    updated_at = now()
  where id = p_vehicle_id;

  -- 6. 同步更新案件底下所有 incident
  update public.incidents
  set
    moderation_status = v_target_status,
    updated_at = now()
  where vehicle_id = p_vehicle_id;

  -- 7. 寫入不可省略的審核紀錄
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

  -- 8. 回傳結果
  return query
  select
    v_public_case_id,
    v_target_status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.moderate_incident_atomic (
  p_incident_id uuid,
  p_action      text,
  p_note        text DEFAULT NULL::text
)
  RETURNS TABLE (
    public_case_id  text,
    incident_number integer,
    new_status      text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
declare
  v_admin_id uuid;
  v_vehicle_id uuid;
  v_public_case_id text;
  v_incident_number integer;
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
    v.public_case_id
  into
    v_vehicle_id,
    v_incident_number,
    v_public_case_id
  from public.incidents i
  join public.vehicles v
    on v.id = i.vehicle_id
  where i.id = p_incident_id
  for update of i;

  if not found then
    raise exception 'Incident not found';
  end if;

  update public.incidents
  set
    moderation_status = p_action,
    updated_at = now()
  where id = p_incident_id;

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
$function$;

CREATE OR REPLACE FUNCTION public.owns_incident (
  target_incident_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  select exists (
    select 1
    from public.incidents i
    join public.vehicles v
      on v.id = i.vehicle_id
    where i.id = target_incident_id
      and v.owner_id = auth.uid()
      and v.deleted_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.owns_vehicle (
  target_vehicle_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
  select exists (
    select 1
    from public.vehicles
    where id = target_vehicle_id
      and owner_id = auth.uid()
      and deleted_at is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.protect_incident_identity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
begin

  if TG_OP = 'UPDATE' then

    if new.vehicle_id is distinct from old.vehicle_id then
      raise exception 'incident vehicle_id cannot be changed';
    end if;

    if new.incident_number is distinct from old.incident_number then
      raise exception 'incident_number cannot be changed';
    end if;

    new.created_at := old.created_at;

  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_vehicle_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
begin

  -- 建立案件時，案件編號一律由系統產生
  if TG_OP = 'INSERT' then

    new.public_case_id := public.generate_nx_case_id();

    new.published_at := null;
    new.deleted_at := null;

    return new;
  end if;


  -- 建立後不能修改案件擁有者
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;


  -- 公開案件編號永遠不能修改
  if new.public_case_id is distinct from old.public_case_id then
    raise exception 'public_case_id cannot be changed';
  end if;


  -- 建立時間不能修改
  new.created_at := old.created_at;


  -- 第一次核准時自動記錄公開時間
  if new.moderation_status = 'approved'
     and old.moderation_status <> 'approved'
     and old.published_at is null then

    new.published_at := now();

  else

    new.published_at := old.published_at;

  end if;


  -- soft delete
  if new.moderation_status = 'deleted'
     and old.moderation_status <> 'deleted' then

    new.deleted_at := now();

  else

    new.deleted_at := old.deleted_at;

  end if;


  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resubmit_incident_atomic (
  p_incident_id          uuid,
  p_mileage              integer,
  p_incident_date        date,
  p_door_positions       text[],
  p_symptoms             text[],
  p_occurrence_frequency text,
  p_dealer_visited       boolean,
  p_has_work_order       boolean,
  p_repair_status        text,
  p_has_quote            boolean,
  p_quoted_amount        integer DEFAULT NULL::integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
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

  if v_status <> 'needs_revision' then
    raise exception 'Incident is not editable';
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
    moderation_status = 'pending',
    updated_at = now()
  where id = p_incident_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_incident_vehicle_link()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
  AS $function$
begin

  if new.incident_id is not null then

    if not exists (
      select 1
      from public.incidents i
      where i.id = new.incident_id
        and i.vehicle_id = new.vehicle_id
    ) then

      raise exception
        'incident_id does not belong to vehicle_id';

    end if;

  end if;

  return new;
end;
$function$;

ALTER TABLE "public"."case_revisions"
  ADD CONSTRAINT "case_revisions_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."case_revisions"
  ADD CONSTRAINT "case_revisions_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE "public"."government_actions"
  ADD CONSTRAINT "government_actions_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE "public"."moderation_logs"
  ADD CONSTRAINT "moderation_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE "public"."moderation_logs"
  ADD CONSTRAINT "moderation_logs_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE SET NULL;

ALTER TABLE "public"."moderation_logs"
  ADD CONSTRAINT "moderation_logs_revision_id_fkey" FOREIGN KEY (revision_id) REFERENCES public.case_revisions(id) ON DELETE SET NULL;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."timeline_events"
  ADD CONSTRAINT "timeline_events_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;

ALTER TABLE "public"."vehicles"
  ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."case_revisions"
  ADD CONSTRAINT "case_revisions_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

ALTER TABLE "public"."government_actions"
  ADD CONSTRAINT "government_actions_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

ALTER TABLE "public"."incidents"
  ADD CONSTRAINT "incidents_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

ALTER TABLE "public"."moderation_logs"
  ADD CONSTRAINT "moderation_logs_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

ALTER TABLE "public"."timeline_events"
  ADD CONSTRAINT "timeline_events_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

CREATE INDEX case_revisions_status_idx ON public.case_revisions USING btree (status);

CREATE INDEX case_revisions_vehicle_id_idx ON public.case_revisions USING btree (vehicle_id);

CREATE INDEX government_actions_type_idx ON public.government_actions USING btree (action_type);

CREATE INDEX government_actions_vehicle_id_idx ON public.government_actions USING btree (vehicle_id);

CREATE INDEX incidents_repair_status_idx ON public.incidents USING btree (repair_status);

CREATE INDEX incidents_vehicle_id_idx ON public.incidents USING btree (vehicle_id);

CREATE INDEX moderation_logs_incident_id_idx ON public.moderation_logs USING btree (incident_id);

CREATE INDEX timeline_events_event_date_idx ON public.timeline_events USING btree (event_date);

CREATE INDEX timeline_events_vehicle_id_idx ON public.timeline_events USING btree (vehicle_id);

CREATE INDEX vehicles_moderation_status_idx ON public.vehicles USING btree (moderation_status);

CREATE INDEX vehicles_owner_id_idx ON public.vehicles USING btree (owner_id);

CREATE INDEX vehicles_public_case_id_idx ON public.vehicles USING btree (public_case_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER validate_revision_incident
  BEFORE INSERT OR UPDATE ON public.case_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_incident_vehicle_link();

CREATE TRIGGER government_actions_set_updated_at
  BEFORE UPDATE ON public.government_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER validate_government_action_incident
  BEFORE INSERT OR UPDATE ON public.government_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_incident_vehicle_link();

CREATE TRIGGER incidents_set_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER protect_incident_identity_trigger
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_incident_identity();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER validate_timeline_incident
  BEFORE INSERT OR UPDATE ON public.timeline_events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_incident_vehicle_link();

CREATE TRIGGER protect_vehicle_fields_trigger
  BEFORE INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_vehicle_fields();

CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "revisions_admin_select_all" ON "public"."case_revisions"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "revisions_admin_update_all" ON "public"."case_revisions"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "revisions_insert_own" ON "public"."case_revisions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((submitted_by = auth.uid()) AND public.owns_vehicle(vehicle_id) AND (status = 'pending'::text) AND ((incident_id IS NULL) OR public.owns_incident(incident_id))));

CREATE POLICY "revisions_select_own" ON "public"."case_revisions"
  FOR SELECT
  TO "authenticated"
  USING (((submitted_by = auth.uid()) AND public.owns_vehicle(vehicle_id)));

CREATE POLICY "government_actions_admin_select_all" ON "public"."government_actions"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "government_actions_admin_update_all" ON "public"."government_actions"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "government_actions_insert_own" ON "public"."government_actions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.owns_vehicle(vehicle_id) AND ((incident_id IS NULL) OR public.owns_incident(incident_id))));

CREATE POLICY "government_actions_select_own" ON "public"."government_actions"
  FOR SELECT
  TO "authenticated"
  USING (public.owns_vehicle(vehicle_id));

CREATE POLICY "government_actions_update_own" ON "public"."government_actions"
  FOR UPDATE
  TO "authenticated"
  USING (public.owns_vehicle(vehicle_id))
  WITH CHECK ((public.owns_vehicle(vehicle_id) AND ((incident_id IS NULL) OR public.owns_incident(incident_id))));

CREATE POLICY "incidents_admin_select_all" ON "public"."incidents"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "incidents_admin_update_all" ON "public"."incidents"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "incidents_insert_own" ON "public"."incidents"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.owns_vehicle(vehicle_id) AND (moderation_status = 'pending'::text)));

CREATE POLICY "incidents_public_select_approved" ON "public"."incidents"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((moderation_status = 'approved'::text) AND public.is_public_vehicle(vehicle_id)));

CREATE POLICY "incidents_select_own" ON "public"."incidents"
  FOR SELECT
  TO "authenticated"
  USING (public.owns_vehicle(vehicle_id));

CREATE POLICY "incidents_update_own_pending" ON "public"."incidents"
  FOR UPDATE
  TO "authenticated"
  USING ((public.owns_vehicle(vehicle_id) AND (moderation_status = ANY (ARRAY['pending'::text, 'needs_revision'::text]))))
  WITH CHECK ((public.owns_vehicle(vehicle_id) AND (moderation_status = ANY (ARRAY['pending'::text, 'needs_revision'::text]))));

CREATE POLICY "moderation_logs_admin_insert" ON "public"."moderation_logs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_admin() AND (admin_id = auth.uid())));

CREATE POLICY "moderation_logs_admin_select_all" ON "public"."moderation_logs"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "profiles_admin_select_all" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "profiles_admin_update" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_select_own" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((id = auth.uid()));

CREATE POLICY "timeline_admin_select_all" ON "public"."timeline_events"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "timeline_admin_update_all" ON "public"."timeline_events"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "timeline_insert_own" ON "public"."timeline_events"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    ((public.owns_vehicle(vehicle_id) AND (source = 'owner'::text) AND (moderation_status = 'pending'::text) AND ((incident_id IS NULL) OR public.owns_incident(incident_id))));

CREATE POLICY "timeline_select_own" ON "public"."timeline_events"
  FOR SELECT
  TO "authenticated"
  USING (public.owns_vehicle(vehicle_id));

CREATE POLICY "vehicles_admin_select_all" ON "public"."vehicles"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "vehicles_admin_update_all" ON "public"."vehicles"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "vehicles_insert_own" ON "public"."vehicles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((owner_id = auth.uid()) AND (moderation_status = 'pending'::text) AND (deleted_at IS NULL)));

CREATE POLICY "vehicles_public_select_approved" ON "public"."vehicles"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((moderation_status = 'approved'::text) AND (published_at IS NOT NULL) AND (deleted_at IS NULL)));

CREATE POLICY "vehicles_select_own" ON "public"."vehicles"
  FOR SELECT
  TO "authenticated"
  USING ((owner_id = auth.uid()));

CREATE POLICY "vehicles_update_own_unpublished" ON "public"."vehicles"
  FOR UPDATE
  TO "authenticated"
  USING (((owner_id = auth.uid()) AND (moderation_status = ANY (ARRAY['pending'::text, 'needs_revision'::text]))))
  WITH CHECK (((owner_id = auth.uid()) AND (moderation_status = ANY (ARRAY['pending'::text, 'needs_revision'::text])) AND (deleted_at IS NULL)));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

REVOKE ALL ON FUNCTION "public"."add_incident_atomic"(uuid, integer, date, text[], text[], text, boolean, boolean, text, boolean, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."add_incident_atomic"(uuid, integer, date, text[], text[], text, boolean, boolean, text, boolean, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_case_atomic"(text, integer, integer, date, text[], text[], text, boolean, boolean, text, boolean, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_case_atomic"(text, integer, integer, date, text[], text[], text, boolean, boolean, text, boolean, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."generate_nx_case_id"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."generate_nx_case_id"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_incident_feedback"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_incident_feedback"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_cases"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_public_cases"() TO "anon", "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_dashboard_summary"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_public_dashboard_summary"() TO "anon", "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "postgres";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."is_public_vehicle"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_public_vehicle"(uuid) TO "anon", "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."moderate_case_atomic"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."moderate_case_atomic"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."moderate_incident_atomic"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."moderate_incident_atomic"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."owns_incident"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."owns_incident"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."owns_vehicle"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."owns_vehicle"(uuid) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_incident_identity"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_vehicle_fields"() TO PUBLIC, "postgres";

REVOKE ALL ON FUNCTION "public"."resubmit_incident_atomic"(uuid, integer, date, text[], text[], text, boolean, boolean, text, boolean, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."resubmit_incident_atomic"(uuid, integer, date, text[], text[], text, boolean, boolean, text, boolean, integer) TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_incident_vehicle_link"() TO PUBLIC, "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."nx_case_seq" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."case_revisions" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."case_revisions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."case_revisions" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."case_revisions" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."government_actions" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."government_actions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."government_actions" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."government_actions" TO "service_role";

REVOKE ALL ("dealer_visited") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("dealer_visited") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("door_positions") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("door_positions") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("has_quote") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("has_quote") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("has_work_order") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("has_work_order") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("id") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("id") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("incident_date") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("incident_date") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("incident_number") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("incident_number") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("mileage") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("mileage") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("moderation_status") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("moderation_status") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("occurrence_frequency") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("occurrence_frequency") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("quoted_amount") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("quoted_amount") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("repair_status") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("repair_status") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("symptoms") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("symptoms") ON TABLE "public"."incidents" TO "anon";

REVOKE ALL ("vehicle_id") ON TABLE "public"."incidents" FROM "anon";

GRANT SELECT ("vehicle_id") ON TABLE "public"."incidents" TO "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."incidents" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incidents" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incidents" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."incidents" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."moderation_logs" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."moderation_logs" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."moderation_logs" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "anon";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."timeline_events" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."timeline_events" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."timeline_events" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."timeline_events" TO "service_role";

REVOKE ALL ("id") ON TABLE "public"."vehicles" FROM "anon";

GRANT SELECT ("id") ON TABLE "public"."vehicles" TO "anon";

REVOKE ALL ("model_year") ON TABLE "public"."vehicles" FROM "anon";

GRANT SELECT ("model_year") ON TABLE "public"."vehicles" TO "anon";

REVOKE ALL ("model") ON TABLE "public"."vehicles" FROM "anon";

GRANT SELECT ("model") ON TABLE "public"."vehicles" TO "anon";

REVOKE ALL ("moderation_status") ON TABLE "public"."vehicles" FROM "anon";

GRANT SELECT ("moderation_status") ON TABLE "public"."vehicles" TO "anon";

REVOKE ALL ("public_case_id") ON TABLE "public"."vehicles" FROM "anon";

GRANT SELECT ("public_case_id") ON TABLE "public"."vehicles" TO "anon";

REVOKE ALL ("published_at") ON TABLE "public"."vehicles" FROM "anon";

GRANT SELECT ("published_at") ON TABLE "public"."vehicles" TO "anon";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."vehicles" TO "anon";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vehicles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vehicles" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."vehicles" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

