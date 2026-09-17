begin;

create or replace function public.get_admin_case_owner_contacts(
  p_vehicle_ids uuid[]
)
returns table (
  vehicle_id uuid,
  owner_id uuid,
  email text,
  full_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  return query
  select
    v.id as vehicle_id,
    v.owner_id,
    u.email::text,
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    )::text as full_name,
    coalesce(
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture'
    )::text as avatar_url
  from public.vehicles v
  join auth.users u
    on u.id = v.owner_id
  where v.id = any(p_vehicle_ids);
end;
$$;

revoke all on function public.get_admin_case_owner_contacts(uuid[])
from public, anon;

grant execute on function public.get_admin_case_owner_contacts(uuid[])
to authenticated;

commit;
