# Clérly live order sheet

Open the existing Clérly Supabase project → Table Editor → `clerly_fulfillment_sheet`.

This private table is the live spreadsheet. A database trigger adds an order when the website records its verified successful payment. Unpaid checkouts stay in `commerce_orders` and do not enter the packing queue. Existing paid orders are backfilled by the migration. No additional customer login is needed to use the Supabase dashboard.

## Daily fulfilment

1. Open `clerly_orders_to_fulfill` for the outstanding paid-order queue, ordered by estimated dispatch date.
2. Open the matching row in `clerly_fulfillment_sheet`. Check `items_to_pack`, the customer address and delivery notes. Quantities count purchased offers; the item label identifies single, duo or trio contents.
3. Set `fulfillment_status` to `packing`, or `on_hold` and explain why in `internal_notes`.
4. Book your courier separately. Enter `courier`, `tracking_number` and optionally an HTTPS `tracking_url`, then set the status to `shipped`. The sheet records `shipped_at` automatically.
5. When delivery is confirmed, change `shipped` to `delivered`; `delivered_at` is recorded automatically.

Statuses: `unfulfilled`, `packing`, `on_hold`, `shipped`, `delivered`, `returned`, `cancelled`.

Only edit fulfilment status, courier/tracking information and internal notes. Customer, payment, items and rand amounts come from the website's authoritative order record. Repeated payment updates preserve your fulfilment progress. Cancelling or marking returned does not issue a refund, book a courier or send a customer message. Handle refunds through the existing payment workflow; once the source order is recorded as refunded, it drops out of the packing queue.

## Statistics and history

- `clerly_fulfillment_stats`: paid orders/value, outstanding orders, on hold, shipped, delivered, returned, refunded and overdue dispatch estimates.
- `clerly_fulfillment_history`: timestamped changes to status, courier, tracking number and internal notes.
- Dispatch estimates use 15–20 Monday–Friday business days after payment in South African time. Public holidays are not excluded; these are estimates.

Refresh Table Editor to see newly paid orders. Export CSV from Table Editor if you need a downloadable spreadsheet; exported files are snapshots and do not update automatically.

The sheet, queue, statistics and history are inaccessible to public and customer API roles. They are managed through the existing Supabase project access and server role.

Migration: `supabase/migrations/20261022143541_order_management.sql`. Test: `tests/fulfillment-sheet.test.ts`, using an isolated local database with fixture data only.

