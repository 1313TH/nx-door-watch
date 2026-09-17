-- =========================================================
-- NX Door Watch
-- Restrict direct owner UPDATE access.
--
-- Owner writes must go through controlled SECURITY DEFINER
-- RPC functions instead of direct table UPDATE.
-- =========================================================

drop policy if exists incidents_update_own_pending
on public.incidents;

drop policy if exists vehicles_update_own_unpublished
on public.vehicles;
