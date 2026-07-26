# Kridiya Operations Archive Structure

Use this structure in SharePoint or any company cloud drive. Keep the folder names stable so staff can find booking, finance, supplier, refund, and audit records without guessing.

## Root

`Kridiya Travel`

## Folder Tree

```text
Kridiya Travel/
  00 Company Records/
    Trade Licence/
    Bank Details/
    VAT and Tax/
    Insurance/
    Contracts/
  01 Operations/
    Bookings/
      YYYY/
        MM/
          BOOKING-REFERENCE - Customer Name/
            01 Customer Documents/
            02 Tickets and Vouchers/
            03 Invoices and Receipts/
            04 Payment Proofs/
            05 Supplier Invoices/
            06 Refunds and Cancellations/
            07 Internal Notes/
    Enquiries/
      YYYY/
        MM/
  02 Finance/
    YYYY/
      MM/
        Accounting Export/
        Payment Proofs/
        Refund Register/
        Supplier Payables/
  03 Corporate Clients/
    Company Name/
      Contacts and Approvals/
      LPOs/
      Monthly Billing/
      Bookings/
  04 Suppliers/
    Supplier Name/
      Contracts/
      Invoices/
      Portal Notes/
  05 Staff and Security/
    Staff Access Reviews/
    Activity Logs/
    Monthly Backups/
  99 Emergency Backups/
    YYYY-MM-DD/
```

## File Naming

Use this format:

`YYYY-MM-DD - BOOKING-REFERENCE - Customer Name - Document Type.ext`

Examples:

- `2026-07-26 - KRI-2026-0005 - Joshua K - Ticket.pdf`
- `2026-07-26 - KRI-2026-0005 - Joshua K - Payment Proof.jpg`
- `2026-07-26 - KRI-2026-0005 - Joshua K - Refund Confirmation.pdf`
- `2026-07-26 - KRI-2026-0005 - Supplier - Air Arabia Invoice.pdf`

## Daily Process

1. Record enquiry and booking in admin first.
2. Upload private operational files inside the admin booking detail when they belong to the booking.
3. Release only customer-ready files from admin using `Release to customer`.
4. Save final copies in SharePoint using the booking folder structure.
5. Record supplier invoices and payment proofs under both the booking folder and monthly finance folder when needed.

## Monthly Owner Process

1. Open Admin > Backups.
2. Click `Download all`.
3. Save the CSV files into:
   `Kridiya Travel/05 Staff and Security/Monthly Backups/YYYY-MM`
4. Save finance exports into:
   `Kridiya Travel/02 Finance/YYYY/MM/Accounting Export`
5. Review staff access, activity log, refunds, and supplier payables.

## Access Rules

- Owner/admin: all folders.
- Finance staff: Finance, payments, supplier invoices, refunds.
- Sales staff: enquiries and customer communication only.
- Operations staff: booking folders and customer documents.
- Customer-visible files must still be released through admin. Do not share raw internal folders directly with customers.
