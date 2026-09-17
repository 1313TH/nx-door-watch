begin;

grant select
on table public.case_archive_requests
to authenticated;

commit;
