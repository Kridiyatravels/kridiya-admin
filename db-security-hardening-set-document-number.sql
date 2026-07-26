revoke execute on function public.set_document_number() from anon;
revoke execute on function public.set_document_number() from authenticated;
revoke execute on function public.set_document_number() from public;
grant execute on function public.set_document_number() to service_role;
