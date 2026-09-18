begin;

alter table public.vehicles
drop constraint if exists vehicles_model_year_check;

alter table public.vehicles
add constraint vehicles_model_year_check
check (
  model_year between 2015 and 2030
);

commit;
