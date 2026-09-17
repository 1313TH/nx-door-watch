begin;

drop policy if exists case_revisions_select_owner
  on public.case_revisions;

create policy case_revisions_select_owner
on public.case_revisions
for select
to authenticated
using (
  submitted_by = auth.uid()
);

drop policy if exists case_revisions_select_admin
  on public.case_revisions;

create policy case_revisions_select_admin
on public.case_revisions
for select
to authenticated
using (
  public.is_admin()
);

commit;
