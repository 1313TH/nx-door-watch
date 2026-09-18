begin;

-- vehicles
create index if not exists idx_vehicles_public_status_published
on public.vehicles (moderation_status, published_at desc)
where deleted_at is null and archived_at is null;

create index if not exists idx_vehicles_owner
on public.vehicles (owner_id);

create index if not exists idx_vehicles_public_case_id
on public.vehicles (public_case_id);

-- incidents
create index if not exists idx_incidents_vehicle_number
on public.incidents (vehicle_id, incident_number desc);

create index if not exists idx_incidents_status_vehicle
on public.incidents (moderation_status, vehicle_id);

create index if not exists idx_incidents_incident_date
on public.incidents (incident_date desc);

-- case_reports
create index if not exists idx_case_reports_vehicle_status
on public.case_reports (vehicle_id, status);

-- case_revisions
create index if not exists idx_case_revisions_status_target
on public.case_revisions (status, target_type);

create index if not exists idx_case_revisions_vehicle_status
on public.case_revisions (vehicle_id, status);

-- archive requests
create index if not exists idx_case_archive_requests_status
on public.case_archive_requests (status);

create index if not exists idx_case_archive_requests_vehicle_status
on public.case_archive_requests (vehicle_id, status);

commit;
