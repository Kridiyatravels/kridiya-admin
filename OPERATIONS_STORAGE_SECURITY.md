# Kridiya Operations Storage And Security

Last reviewed: 2026-07-26

## Customer Visibility

Customers do not see staff-only records by default.

- Booking files are stored in the private `booking-documents` bucket.
- Customer account pages read `public.booking_documents`.
- A booking document is customer-visible only when `visible_to_customer = true`.
- Staff upload flow currently records new booking documents as `visible_to_customer = false`.
- Staff can still open private files through short-lived signed URLs inside the admin portal.

## Storage Buckets

| Bucket | Public | Purpose | Customer exposure |
| --- | --- | --- | --- |
| `booking-documents` | No | Tickets, vouchers, booking files, support documents | Only metadata marked `visible_to_customer = true`; files stay private |
| `booking-payment-proofs` | No | Customer payment proof uploads | Staff finance use only |
| `supplier-invoices` | No | Supplier invoices and backup links | Internal only |
| `enquiry-uploads` | No | Customer enquiry attachments | Owner or staff only |

## SharePoint Role

SharePoint is the long-term business archive. Supabase Storage is the operational app store used by the portal.

Recommended method:

1. Upload/record working files in the admin booking detail page.
2. Keep customer-facing files private unless they are intentionally released.
3. Save monthly finance and supplier copies to SharePoint.
4. Store SharePoint links only for internal staff backup/reference.

## Security Decisions

- Anonymous users cannot execute staff/admin functions.
- `public.set_document_number()` is a trigger-only function and is not callable by anonymous or signed-in browser users.
- Staff/admin RPCs remain callable by signed-in users because the admin portal uses them, but each sensitive RPC must validate staff permission inside the function body.
- Supabase advisor still reports signed-in `SECURITY DEFINER` RPC warnings for intentional staff RPCs. Do not blindly revoke them without replacing the admin portal call path.

## Manual Dashboard Setting Still Needed

Enable Supabase Auth leaked password protection in the Supabase dashboard:

Auth -> Sign In / Providers -> Password security -> Leaked password protection.

