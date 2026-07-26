drop policy if exists payments_select_customer_own on public.payments;

create policy payments_select_customer_own
on public.payments
for select
to authenticated
using (
  payment_direction = 'customer_in'
  and (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and b.user_id = (select auth.uid())
        and b.archived_at is null
    )
    or exists (
      select 1 from public.enquiries e
      where e.id = payments.enquiry_id
        and e.user_id = (select auth.uid())
    )
  )
);
