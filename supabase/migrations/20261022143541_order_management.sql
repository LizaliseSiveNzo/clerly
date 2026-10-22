-- Private, spreadsheet-style fulfilment queue. Source payment records stay authoritative.
create table public.clerly_fulfillment_sheet (
 order_id uuid primary key references public.commerce_orders(id),
 order_number text not null unique,
 order_placed_at timestamptz not null,
 paid_at timestamptz not null,
 payment_status text not null,
 customer_name text not null,
 customer_email text not null,
 customer_phone text not null,
 street_address text not null,
 suburb text not null default '',
 city text not null,
 province text not null,
 postal_code text not null,
 customer_delivery_notes text not null default '',
 items_to_pack text not null,
 order_items jsonb not null,
 bundle_quantity integer not null,
 products_total_zar numeric(12,2) not null,
 delivery_charge_zar numeric(12,2) not null,
 order_total_zar numeric(12,2) not null,
 payment_reference text,
 estimated_dispatch_from date not null,
 estimated_dispatch_by date not null,
 fulfillment_status text not null default 'unfulfilled'
  check(fulfillment_status in ('unfulfilled','packing','on_hold','shipped','delivered','returned','cancelled')),
 courier text not null default '',
 tracking_number text not null default '',
 tracking_url text not null default '' check(tracking_url='' or tracking_url ~ '^https://[^[:space:]]+$'),
 shipped_at timestamptz,
 delivered_at timestamptz,
 internal_notes text not null default '',
 updated_at timestamptz not null default now()
);
comment on table public.clerly_fulfillment_sheet is 'Live paid-order spreadsheet. Edit fulfillment_status, courier, tracking_number, tracking_url and internal_notes. Customer/payment/item columns sync automatically from website orders. Bundle quantity counts purchased offers, not individual bottles.';
comment on column public.clerly_fulfillment_sheet.estimated_dispatch_by is 'Paid date plus 20 Monday-Friday business days, Africa/Johannesburg. Public holidays are not excluded. An estimate, not a courier booking.';
comment on column public.clerly_fulfillment_sheet.fulfillment_status is 'Editable: unfulfilled, packing, on_hold, shipped, delivered, returned, cancelled. This does not issue a refund or book a courier.';
alter table public.clerly_fulfillment_sheet enable row level security;
revoke all on public.clerly_fulfillment_sheet from public,anon,authenticated;
grant select,insert,update,delete on public.clerly_fulfillment_sheet to service_role;
create index clerly_fulfillment_queue on public.clerly_fulfillment_sheet(fulfillment_status,estimated_dispatch_by,paid_at);

create table public.clerly_fulfillment_history (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.clerly_fulfillment_sheet(order_id),
 changed_at timestamptz not null default now(),
 previous_status text,
 new_status text not null,
 courier text,
 tracking_number text,
 internal_notes text
);
alter table public.clerly_fulfillment_history enable row level security;
revoke all on public.clerly_fulfillment_history from public,anon,authenticated;
grant select,insert on public.clerly_fulfillment_history to service_role;
grant usage,select on sequence public.clerly_fulfillment_history_id_seq to service_role;

create function public.clerly_business_date(p_start date,p_days integer) returns date
language sql immutable security invoker set search_path=public,pg_temp as $$
 select d::date from generate_series(p_start+1,p_start+(p_days*3+14),interval '1 day') d
 where extract(isodow from d)<6 order by d offset greatest(p_days-1,0) limit 1;
$$;
revoke all on function public.clerly_business_date(date,integer) from public,anon,authenticated;
grant execute on function public.clerly_business_date(date,integer) to service_role;

create function public.clerly_upsert_paid_order(p_order public.commerce_orders) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare subtotal integer; qty integer; packing text;
begin
 if p_order.store_id<>'still-form' then return; end if;
 -- Failed/pending checkouts never enter the sheet. Later refunds remain visible.
 if p_order.paid_at is null or p_order.status not in ('paid','shipped','refunded') then return; end if;
 select coalesce(sum((i->>'unitPrice')::integer*(i->>'qty')::integer),0),
        coalesce(sum((i->>'qty')::integer),0),
        string_agg(format('%s x %s | %s | SKU: %s',i->>'qty',i->>'title',i->>'label',i->>'sku'),E'\n' order by ord)
 into subtotal,qty,packing from jsonb_array_elements(p_order.items) with ordinality as lines(i,ord);
 insert into public.clerly_fulfillment_sheet(order_id,order_number,order_placed_at,paid_at,payment_status,customer_name,customer_email,customer_phone,street_address,suburb,city,province,postal_code,customer_delivery_notes,items_to_pack,order_items,bundle_quantity,products_total_zar,delivery_charge_zar,order_total_zar,payment_reference,estimated_dispatch_from,estimated_dispatch_by,fulfillment_status)
 values(p_order.id,'CL-'||p_order.id::text,p_order.created_at,p_order.paid_at,p_order.status,coalesce(p_order.customer->>'fullName',''),coalesce(p_order.customer->>'email',''),coalesce(p_order.customer->>'phone',''),coalesce(p_order.customer->>'streetAddress',''),coalesce(p_order.customer->>'suburb',''),coalesce(p_order.customer->>'city',''),coalesce(p_order.customer->>'province',''),coalesce(p_order.customer->>'postalCode',''),coalesce(p_order.customer->>'notes',''),coalesce(packing,''),p_order.items,qty,subtotal/100.0,(p_order.amount_cents-subtotal)/100.0,p_order.amount_cents/100.0,p_order.payment_id,clerly_business_date((p_order.paid_at at time zone 'Africa/Johannesburg')::date,15),clerly_business_date((p_order.paid_at at time zone 'Africa/Johannesburg')::date,20),case when p_order.status='shipped' then 'shipped' else 'unfulfilled' end)
 on conflict(order_id) do update set
 payment_status=excluded.payment_status,paid_at=excluded.paid_at,
 customer_name=excluded.customer_name,customer_email=excluded.customer_email,customer_phone=excluded.customer_phone,
 street_address=excluded.street_address,suburb=excluded.suburb,city=excluded.city,province=excluded.province,postal_code=excluded.postal_code,
 customer_delivery_notes=excluded.customer_delivery_notes,items_to_pack=excluded.items_to_pack,order_items=excluded.order_items,bundle_quantity=excluded.bundle_quantity,
 products_total_zar=excluded.products_total_zar,delivery_charge_zar=excluded.delivery_charge_zar,order_total_zar=excluded.order_total_zar,payment_reference=excluded.payment_reference;
 return;
end $$;
revoke all on function public.clerly_upsert_paid_order(public.commerce_orders) from public,anon,authenticated;
grant execute on function public.clerly_upsert_paid_order(public.commerce_orders) to service_role;
create function public.clerly_sync_paid_order() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform public.clerly_upsert_paid_order(new);
 return new;
end $$;
revoke all on function public.clerly_sync_paid_order() from public,anon,authenticated;
grant execute on function public.clerly_sync_paid_order() to service_role;
create trigger clerly_paid_order_to_sheet after insert or update of status,paid_at,customer,items,amount_cents,payment_id on public.commerce_orders for each row execute function public.clerly_sync_paid_order();

create function public.clerly_stamp_fulfillment() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare source_status text;
begin
 select status into source_status from public.commerce_orders where id=new.order_id and store_id='still-form';
 if source_status is null then raise exception 'Clerly order required'; end if;
 if tg_op='INSERT' and source_status not in ('paid','shipped','refunded') then raise exception 'Paid order required'; end if;
 if tg_op='UPDATE' and new.order_id<>old.order_id then raise exception 'Order identity cannot change'; end if;
 if tg_op='UPDATE' and new.fulfillment_status is distinct from old.fulfillment_status then
  if new.fulfillment_status in ('packing','shipped','delivered') and source_status not in ('paid','shipped') then raise exception 'Only paid orders can be fulfilled'; end if;
  if new.fulfillment_status='delivered' and old.fulfillment_status<>'shipped' then raise exception 'Mark the order shipped before delivered'; end if;
  if new.fulfillment_status='shipped' and (btrim(new.courier)='' or btrim(new.tracking_number)='') then raise exception 'Enter courier and tracking number before marking shipped'; end if;
  if new.fulfillment_status='shipped' and new.shipped_at is null then new.shipped_at:=now(); end if;
  if new.fulfillment_status='delivered' and new.delivered_at is null then new.delivered_at:=now(); end if;
 end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function public.clerly_stamp_fulfillment() from public,anon,authenticated;
grant execute on function public.clerly_stamp_fulfillment() to service_role;
create trigger clerly_stamp_sheet before insert or update on public.clerly_fulfillment_sheet for each row execute function public.clerly_stamp_fulfillment();
create function public.clerly_audit_fulfillment() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' then
  insert into public.clerly_fulfillment_history(order_id,new_status,courier,tracking_number,internal_notes) values(new.order_id,new.fulfillment_status,new.courier,new.tracking_number,new.internal_notes);
 elsif row(new.fulfillment_status,new.courier,new.tracking_number,new.internal_notes) is distinct from row(old.fulfillment_status,old.courier,old.tracking_number,old.internal_notes) then
  insert into public.clerly_fulfillment_history(order_id,previous_status,new_status,courier,tracking_number,internal_notes) values(new.order_id,old.fulfillment_status,new.fulfillment_status,new.courier,new.tracking_number,new.internal_notes);
 end if;
 return new;
end $$;
revoke all on function public.clerly_audit_fulfillment() from public,anon,authenticated;
grant execute on function public.clerly_audit_fulfillment() to service_role;
create trigger clerly_audit_sheet after insert or update on public.clerly_fulfillment_sheet for each row execute function public.clerly_audit_fulfillment();

create view public.clerly_orders_to_fulfill with (security_invoker=true) as
 select * from public.clerly_fulfillment_sheet
 where payment_status in ('paid','shipped') and fulfillment_status in ('unfulfilled','packing','on_hold')
 order by estimated_dispatch_by,paid_at;
create view public.clerly_fulfillment_stats with (security_invoker=true) as
 select count(*) filter(where payment_status in ('paid','shipped')) as paid_orders,
 count(*) filter(where payment_status in ('paid','shipped') and fulfillment_status in ('unfulfilled','packing','on_hold')) as orders_to_fulfill,
 count(*) filter(where payment_status in ('paid','shipped') and fulfillment_status='on_hold') as on_hold,
 count(*) filter(where fulfillment_status='shipped') as shipped,
 count(*) filter(where fulfillment_status='delivered') as delivered,
 count(*) filter(where fulfillment_status='returned') as returned,
 count(*) filter(where payment_status='refunded') as refunded,
 coalesce(sum(order_total_zar) filter(where payment_status in ('paid','shipped')),0) as paid_order_value_zar,
 count(*) filter(where payment_status in ('paid','shipped') and fulfillment_status in ('unfulfilled','packing','on_hold') and estimated_dispatch_by<(now() at time zone 'Africa/Johannesburg')::date) as past_dispatch_estimate
 from public.clerly_fulfillment_sheet;
revoke all on public.clerly_orders_to_fulfill,public.clerly_fulfillment_stats from public,anon,authenticated;
grant select on public.clerly_orders_to_fulfill,public.clerly_fulfillment_stats to service_role;
comment on view public.clerly_orders_to_fulfill is 'Paid orders still awaiting fulfilment, earliest dispatch estimate first. Edit the matching row in clerly_fulfillment_sheet.';
-- Backfill without updating live order/payment records.
do $$ declare o public.commerce_orders; begin
 for o in select * from public.commerce_orders where store_id='still-form' and paid_at is not null and status in ('paid','shipped','refunded') loop
  perform public.clerly_upsert_paid_order(o);
 end loop;
end $$;

