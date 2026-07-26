-- Kridiya Travel - advanced staff profile management.
-- Run in Supabase SQL editor for project jmvqqpughlzeqrcyavwz.
-- Adds complete owner-managed staff profiles, temporary holds, permission
-- upserts, profile deletion, and audit records for every access change.

begin;

alter table public.staff_profiles
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists notes text,
  add column if not exists hold_until timestamptz,
  add column if not exists hold_reason text,
  add column if not exists deleted_at timestamptz;

create table if not exists public.staff_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  view_enquiries boolean not null default false,
  edit_enquiries boolean not null default false,
  view_customers boolean not null default false,
  edit_customers boolean not null default false,
  view_corporates boolean not null default false,
  edit_corporates boolean not null default false,
  create_bookings boolean not null default false,
  edit_bookings boolean not null default false,
  view_payments boolean not null default false,
  edit_payments boolean not null default false,
  view_supplier_cost boolean not null default false,
  view_profit boolean not null default false,
  generate_documents boolean not null default false,
  manage_portals boolean not null default false,
  manage_templates boolean not null default false,
  view_reports boolean not null default false,
  export_reports boolean not null default false,
  approve_refunds boolean not null default false,
  approve_discounts boolean not null default false,
  manage_staff boolean not null default false,
  view_activity boolean not null default false,
  manage_settings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_permissions
  add column if not exists view_enquiries boolean not null default false,
  add column if not exists edit_enquiries boolean not null default false,
  add column if not exists view_customers boolean not null default false,
  add column if not exists edit_customers boolean not null default false,
  add column if not exists view_corporates boolean not null default false,
  add column if not exists edit_corporates boolean not null default false,
  add column if not exists create_bookings boolean not null default false,
  add column if not exists edit_bookings boolean not null default false,
  add column if not exists view_payments boolean not null default false,
  add column if not exists edit_payments boolean not null default false,
  add column if not exists view_supplier_cost boolean not null default false,
  add column if not exists view_profit boolean not null default false,
  add column if not exists generate_documents boolean not null default false,
  add column if not exists manage_portals boolean not null default false,
  add column if not exists manage_templates boolean not null default false,
  add column if not exists view_reports boolean not null default false,
  add column if not exists export_reports boolean not null default false,
  add column if not exists approve_refunds boolean not null default false,
  add column if not exists approve_discounts boolean not null default false,
  add column if not exists manage_staff boolean not null default false,
  add column if not exists view_activity boolean not null default false,
  add column if not exists manage_settings boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists staff_permissions_set_updated_at on public.staff_permissions;
create trigger staff_permissions_set_updated_at
before update on public.staff_permissions
for each row execute function public.set_updated_at();

alter table public.staff_permissions enable row level security;

drop policy if exists staff_permissions_select_admin_or_self on public.staff_permissions;
create policy staff_permissions_select_admin_or_self
on public.staff_permissions for select
to authenticated
using (public.is_admin() or user_id = auth.uid());

drop policy if exists staff_permissions_manage_admin on public.staff_permissions;
create policy staff_permissions_manage_admin
on public.staff_permissions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_roles sr
    left join public.staff_profiles sp on sp.user_id = sr.user_id
    where sr.user_id = auth.uid()
      and sr.role in ('owner', 'admin', 'staff', 'support')
      and coalesce(sp.active, true) = true
      and coalesce(sp.deleted_at is null, true)
      and (sp.hold_until is null or sp.hold_until <= now())
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_roles sr
    left join public.staff_profiles sp on sp.user_id = sr.user_id
    where sr.user_id = auth.uid()
      and sr.role in ('owner', 'admin')
      and coalesce(sp.active, true) = true
      and coalesce(sp.deleted_at is null, true)
      and (sp.hold_until is null or sp.hold_until <= now())
  );
$$;

create or replace function public.has_staff_permission(permission_name text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  allowed boolean := false;
begin
  if public.is_admin() then
    return true;
  end if;
  if not public.is_staff() then
    return false;
  end if;

  case permission_name
    when 'view_enquiries' then select sp.view_enquiries into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'edit_enquiries' then select sp.edit_enquiries into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_customers' then select sp.view_customers into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'edit_customers' then select sp.edit_customers into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_corporates' then select sp.view_corporates into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'edit_corporates' then select sp.edit_corporates into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'create_bookings' then select sp.create_bookings into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'edit_bookings' then select sp.edit_bookings into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_payments' then select sp.view_payments into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'edit_payments' then select sp.edit_payments into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_supplier_cost' then select sp.view_supplier_cost into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_profit' then select sp.view_profit into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'generate_documents' then select sp.generate_documents into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'manage_portals' then select sp.manage_portals into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'manage_templates' then select sp.manage_templates into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_reports' then select sp.view_reports into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'export_reports' then select sp.export_reports into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'approve_refunds' then select sp.approve_refunds into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'approve_discounts' then select sp.approve_discounts into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'manage_staff' then select sp.manage_staff into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'view_activity' then select sp.view_activity into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    when 'manage_settings' then select sp.manage_settings into allowed from public.staff_permissions sp where sp.user_id = auth.uid();
    else allowed := false;
  end case;

  return coalesce(allowed, false);
end;
$$;

create or replace function public.staff_email_for_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare
  matched_email text;
begin
  if p_pin !~ '^[0-9]{6}$' then
    return null;
  end if;

  select au.email::text into matched_email
  from public.staff_profiles sp
  join auth.users au on au.id = sp.user_id
  where sp.active = true
    and sp.deleted_at is null
    and (sp.hold_until is null or sp.hold_until <= now())
    and au.encrypted_password = crypt(p_pin, au.encrypted_password)
  limit 1;

  return matched_email;
end;
$$;

create or replace function public.staff_management_admin_count(except_user_id uuid default null)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.staff_roles sr
  left join public.staff_profiles sp on sp.user_id = sr.user_id
  where sr.role in ('owner', 'admin')
    and (except_user_id is null or sr.user_id <> except_user_id)
    and coalesce(sp.active, true) = true
    and coalesce(sp.deleted_at is null, true)
    and (sp.hold_until is null or sp.hold_until <= now());
$$;

create or replace function public.get_staff_management_profiles()
returns table(
  user_id uuid,
  email text,
  role public.staff_role,
  full_name text,
  department text,
  job_title text,
  phone text,
  notes text,
  active boolean,
  hold_until timestamptz,
  hold_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  permissions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view staff management profiles';
  end if;

  return query
    select
      sr.user_id,
      au.email::text,
      sr.role,
      coalesce(sp.full_name, au.email::text),
      sp.department,
      sp.job_title,
      sp.phone,
      sp.notes,
      coalesce(sp.active, true),
      sp.hold_until,
      sp.hold_reason,
      coalesce(sp.created_at, sr.created_at),
      coalesce(sp.updated_at, sr.created_at),
      jsonb_build_object(
        'view_enquiries', coalesce(p.view_enquiries, false),
        'edit_enquiries', coalesce(p.edit_enquiries, false),
        'view_customers', coalesce(p.view_customers, false),
        'edit_customers', coalesce(p.edit_customers, false),
        'view_corporates', coalesce(p.view_corporates, false),
        'edit_corporates', coalesce(p.edit_corporates, false),
        'create_bookings', coalesce(p.create_bookings, false),
        'edit_bookings', coalesce(p.edit_bookings, false),
        'view_payments', coalesce(p.view_payments, false),
        'edit_payments', coalesce(p.edit_payments, false),
        'view_supplier_cost', coalesce(p.view_supplier_cost, false),
        'view_profit', coalesce(p.view_profit, false),
        'generate_documents', coalesce(p.generate_documents, false),
        'manage_portals', coalesce(p.manage_portals, false),
        'manage_templates', coalesce(p.manage_templates, false),
        'view_reports', coalesce(p.view_reports, false),
        'export_reports', coalesce(p.export_reports, false),
        'approve_refunds', coalesce(p.approve_refunds, false),
        'approve_discounts', coalesce(p.approve_discounts, false),
        'manage_staff', coalesce(p.manage_staff, false),
        'view_activity', coalesce(p.view_activity, false),
        'manage_settings', coalesce(p.manage_settings, false)
      )
    from public.staff_roles sr
    join auth.users au on au.id = sr.user_id
    left join public.staff_profiles sp on sp.user_id = sr.user_id and sp.deleted_at is null
    left join public.staff_permissions p on p.user_id = sr.user_id
    order by coalesce(sp.active, true) desc, coalesce(sp.full_name, au.email::text);
end;
$$;

create or replace function public.update_staff_profile(
  target_user_id uuid,
  full_name text,
  department text default null,
  job_title text default null,
  phone text default null,
  role public.staff_role default 'staff',
  active boolean default true,
  notes text default null,
  hold_until timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can update staff profiles';
  end if;
  if target_user_id = auth.uid() and active = false then
    raise exception 'You cannot deactivate your own staff account';
  end if;
  if char_length(trim(coalesce(full_name, ''))) < 2 then
    raise exception 'Full name is required';
  end if;
  if (role not in ('owner', 'admin')) and public.staff_management_admin_count(target_user_id) < 1 then
    raise exception 'Keep at least one active owner/admin account';
  end if;

  insert into public.staff_profiles (
    user_id, full_name, department, job_title, phone, notes, active, hold_until, hold_reason, created_by, deleted_at
  )
  values (
    target_user_id, trim(full_name), nullif(trim(coalesce(department, '')), ''),
    nullif(trim(coalesce(job_title, '')), ''), nullif(trim(coalesce(phone, '')), ''),
    nullif(trim(coalesce(notes, '')), ''), active, hold_until,
    case when hold_until is null then null else nullif(trim(coalesce(notes, '')), '') end,
    auth.uid(), null
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    department = excluded.department,
    job_title = excluded.job_title,
    phone = excluded.phone,
    notes = excluded.notes,
    active = excluded.active,
    hold_until = excluded.hold_until,
    hold_reason = excluded.hold_reason,
    deleted_at = null,
    updated_at = now();

  insert into public.staff_roles (user_id, role)
  values (target_user_id, role)
  on conflict (user_id) do update set role = excluded.role;

  insert into public.audit_events(actor_user_id, target_user_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), target_user_id, 'staff.profile_updated', 'user', target_user_id, jsonb_build_object('role', role, 'active', active, 'hold_until', hold_until));

  return 'updated';
end;
$$;

create or replace function public.update_staff_permissions(target_user_id uuid, permissions jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can update staff permissions';
  end if;

  insert into public.staff_permissions (
    user_id, view_enquiries, edit_enquiries, view_customers, edit_customers,
    view_corporates, edit_corporates, create_bookings, edit_bookings,
    view_payments, edit_payments, view_supplier_cost, view_profit,
    generate_documents, manage_portals, manage_templates, view_reports,
    export_reports, approve_refunds, approve_discounts, manage_staff,
    view_activity, manage_settings
  )
  values (
    target_user_id,
    coalesce((permissions->>'view_enquiries')::boolean, false),
    coalesce((permissions->>'edit_enquiries')::boolean, false),
    coalesce((permissions->>'view_customers')::boolean, false),
    coalesce((permissions->>'edit_customers')::boolean, false),
    coalesce((permissions->>'view_corporates')::boolean, false),
    coalesce((permissions->>'edit_corporates')::boolean, false),
    coalesce((permissions->>'create_bookings')::boolean, false),
    coalesce((permissions->>'edit_bookings')::boolean, false),
    coalesce((permissions->>'view_payments')::boolean, false),
    coalesce((permissions->>'edit_payments')::boolean, false),
    coalesce((permissions->>'view_supplier_cost')::boolean, false),
    coalesce((permissions->>'view_profit')::boolean, false),
    coalesce((permissions->>'generate_documents')::boolean, false),
    coalesce((permissions->>'manage_portals')::boolean, false),
    coalesce((permissions->>'manage_templates')::boolean, false),
    coalesce((permissions->>'view_reports')::boolean, false),
    coalesce((permissions->>'export_reports')::boolean, false),
    coalesce((permissions->>'approve_refunds')::boolean, false),
    coalesce((permissions->>'approve_discounts')::boolean, false),
    coalesce((permissions->>'manage_staff')::boolean, false),
    coalesce((permissions->>'view_activity')::boolean, false),
    coalesce((permissions->>'manage_settings')::boolean, false)
  )
  on conflict (user_id) do update set
    view_enquiries = excluded.view_enquiries,
    edit_enquiries = excluded.edit_enquiries,
    view_customers = excluded.view_customers,
    edit_customers = excluded.edit_customers,
    view_corporates = excluded.view_corporates,
    edit_corporates = excluded.edit_corporates,
    create_bookings = excluded.create_bookings,
    edit_bookings = excluded.edit_bookings,
    view_payments = excluded.view_payments,
    edit_payments = excluded.edit_payments,
    view_supplier_cost = excluded.view_supplier_cost,
    view_profit = excluded.view_profit,
    generate_documents = excluded.generate_documents,
    manage_portals = excluded.manage_portals,
    manage_templates = excluded.manage_templates,
    view_reports = excluded.view_reports,
    export_reports = excluded.export_reports,
    approve_refunds = excluded.approve_refunds,
    approve_discounts = excluded.approve_discounts,
    manage_staff = excluded.manage_staff,
    view_activity = excluded.view_activity,
    manage_settings = excluded.manage_settings,
    updated_at = now();

  insert into public.audit_events(actor_user_id, target_user_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), target_user_id, 'staff.permissions_updated', 'user', target_user_id, permissions);

  return 'updated';
end;
$$;

create or replace function public.hold_staff(target_user_id uuid, hold_until timestamptz, reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can hold staff access';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot hold your own staff account';
  end if;
  if hold_until is null or hold_until <= now() then
    raise exception 'Hold-until time must be in the future';
  end if;
  if public.staff_management_admin_count(target_user_id) < 1 then
    raise exception 'Keep at least one active owner/admin account';
  end if;

  insert into public.staff_profiles (user_id, full_name, active, hold_until, hold_reason, created_by)
  select
    target_user_id,
    coalesce(nullif(trim(au.raw_user_meta_data->>'full_name'), ''), au.email::text),
    true,
    $2,
    nullif(trim(coalesce(reason, 'Temporary hold')), ''),
    auth.uid()
  from auth.users au
  where au.id = target_user_id
  on conflict (user_id) do update set
    active = true,
    hold_until = excluded.hold_until,
    hold_reason = excluded.hold_reason,
    deleted_at = null,
    updated_at = now();

  insert into public.audit_events(actor_user_id, target_user_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), target_user_id, 'staff.held', 'user', target_user_id, jsonb_build_object('hold_until', hold_until, 'reason', reason));

  return 'held';
end;
$$;

create or replace function public.reactivate_staff(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reactivate staff access';
  end if;

  insert into public.staff_profiles (user_id, full_name, active, hold_until, hold_reason, created_by)
  select
    target_user_id,
    coalesce(nullif(trim(au.raw_user_meta_data->>'full_name'), ''), au.email::text),
    true,
    null,
    null,
    auth.uid()
  from auth.users au
  where au.id = target_user_id
  on conflict (user_id) do update set
    active = true,
    hold_until = null,
    hold_reason = null,
    deleted_at = null,
    updated_at = now();

  insert into public.audit_events(actor_user_id, target_user_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), target_user_id, 'staff.reactivated', 'user', target_user_id, '{}'::jsonb);

  return 'reactivated';
end;
$$;

create or replace function public.delete_staff_profile(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete staff profiles';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own staff profile';
  end if;
  if public.staff_management_admin_count(target_user_id) < 1 then
    raise exception 'Keep at least one active owner/admin account';
  end if;

  delete from public.staff_permissions where user_id = target_user_id;
  delete from public.staff_roles where user_id = target_user_id;
  update public.staff_profiles
  set active = false,
      deleted_at = now(),
      hold_until = null,
      hold_reason = null,
      updated_at = now()
  where user_id = target_user_id;

  insert into public.audit_events(actor_user_id, target_user_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), target_user_id, 'staff.profile_deleted', 'user', target_user_id, '{}'::jsonb);

  return 'deleted';
end;
$$;

revoke all on public.staff_permissions from anon, authenticated;
grant select, insert, update, delete on public.staff_permissions to authenticated;

revoke execute on function public.get_staff_management_profiles() from public, anon;
revoke execute on function public.update_staff_profile(uuid, text, text, text, text, public.staff_role, boolean, text, timestamptz) from public, anon;
revoke execute on function public.update_staff_permissions(uuid, jsonb) from public, anon;
revoke execute on function public.hold_staff(uuid, timestamptz, text) from public, anon;
revoke execute on function public.reactivate_staff(uuid) from public, anon;
revoke execute on function public.delete_staff_profile(uuid) from public, anon;
revoke execute on function public.staff_management_admin_count(uuid) from public, anon;

grant execute on function public.get_staff_management_profiles() to authenticated, service_role;
grant execute on function public.update_staff_profile(uuid, text, text, text, text, public.staff_role, boolean, text, timestamptz) to authenticated, service_role;
grant execute on function public.update_staff_permissions(uuid, jsonb) to authenticated, service_role;
grant execute on function public.hold_staff(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.reactivate_staff(uuid) to authenticated, service_role;
grant execute on function public.delete_staff_profile(uuid) to authenticated, service_role;
grant execute on function public.staff_management_admin_count(uuid) to authenticated, service_role;

revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.has_staff_permission(text) from public, anon;
revoke execute on function public.staff_email_for_pin(text) from public;

grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.has_staff_permission(text) to authenticated, service_role;
grant execute on function public.staff_email_for_pin(text) to anon, authenticated, service_role;

commit;
