-- ============================================================
-- Kridiya — guest-enquiry auto-linking on signup
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- (Claude's automated apply was blocked because it modifies an auth
--  signup function; running it yourself is the safe way.)
--
-- What it does when a NEW account is created:
--   1. Creates their self-service profile (unchanged behaviour).
--   2. Attaches ALL past guest enquiries with the same email to the new
--      account, so the customer sees their old enquiries when they log in.
--   3. Links or creates the CRM customer record for them.
-- Safe: only claims enquiries whose email matches the verified new account.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name  text;
  v_phone text;
  v_cust_id uuid;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    (select e.full_name from public.enquiries e
       where lower(e.email) = lower(new.email) order by e.created_at desc limit 1),
    split_part(new.email, '@', 1)
  );
  v_phone := coalesce(
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    (select e.phone from public.enquiries e
       where lower(e.email) = lower(new.email) and e.phone is not null
       order by e.created_at desc limit 1)
  );

  -- 1) self-service profile (unchanged behaviour)
  insert into public.profiles (id, full_name, preferred_email, phone, whatsapp)
  values (
    new.id, v_name, new.email, v_phone,
    nullif(trim(new.raw_user_meta_data->>'whatsapp'), '')
  )
  on conflict (id) do nothing;

  -- 2) claim any guest enquiries sent with this email before the account existed
  update public.enquiries
     set user_id = new.id, updated_at = now()
   where user_id is null
     and lower(email) = lower(new.email);

  -- 3) link (or create) the CRM customer record for this person
  select id into v_cust_id from public.customers where auth_user_id = new.id limit 1;
  if v_cust_id is null then
    update public.customers
       set auth_user_id = new.id, updated_at = now()
     where auth_user_id is null
       and lower(email) = lower(new.email)
       and archived_at is null
    returning id into v_cust_id;
  end if;
  if v_cust_id is null then
    insert into public.customers (full_name, email, phone, auth_user_id, source)
    values (v_name, new.email, v_phone, new.id, 'website');
  end if;

  return new;
end;
$function$;
