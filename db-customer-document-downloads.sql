drop policy if exists booking_documents_select_customer_released on storage.objects;

create policy booking_documents_select_customer_released
on storage.objects
for select
to authenticated
using (
  bucket_id = 'booking-documents'
  and exists (
    select 1
    from public.booking_documents bd
    where bd.storage_path = storage.objects.name
      and bd.visible_to_customer = true
      and bd.user_id = (select auth.uid())
  )
);
