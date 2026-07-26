create table if not exists public.staff_template_overrides (
  template_key text primary key,
  subject text,
  body text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.staff_template_overrides enable row level security;

revoke all on table public.staff_template_overrides from anon, authenticated;
grant select, insert, update, delete on public.staff_template_overrides to authenticated;
grant select, insert, update, delete on public.staff_template_overrides to service_role;

drop policy if exists "Staff can read template overrides" on public.staff_template_overrides;
create policy "Staff can read template overrides"
  on public.staff_template_overrides
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists "Staff can insert template overrides" on public.staff_template_overrides;
create policy "Staff can insert template overrides"
  on public.staff_template_overrides
  for insert
  to authenticated
  with check (public.is_staff() and updated_by = (select auth.uid()));

drop policy if exists "Staff can update template overrides" on public.staff_template_overrides;
create policy "Staff can update template overrides"
  on public.staff_template_overrides
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff() and updated_by = (select auth.uid()));

drop policy if exists "Staff can delete template overrides" on public.staff_template_overrides;
create policy "Staff can delete template overrides"
  on public.staff_template_overrides
  for delete
  to authenticated
  using (public.is_staff());
