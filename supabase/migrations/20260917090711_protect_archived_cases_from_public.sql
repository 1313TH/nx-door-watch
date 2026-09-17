begin;

-- 統一判斷：這台車是否仍為可公開案件
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
      and v.moderation_status = 'approved'
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

-- 匿名角色讀 vehicles 時，額外強制排除 archived
drop policy if exists vehicles_public_not_archived
on public.vehicles;

create policy vehicles_public_not_archived
on public.vehicles
as restrictive
for select
to anon
using (
  archived_at is null
);

-- incidents 也必須跟著 vehicle 封存狀態隱藏
drop policy if exists incidents_public_vehicle_not_archived
on public.incidents;

create policy incidents_public_vehicle_not_archived
on public.incidents
as restrictive
for select
to anon
using (
  public.is_public_unarchived_vehicle(vehicle_id)
);

commit;
