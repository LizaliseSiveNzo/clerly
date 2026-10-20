alter table public.commerce_stores add column if not exists preorder_order_limit integer check(preorder_order_limit>0);
create index if not exists commerce_orders_batch_capacity on public.commerce_orders(store_id) where status<>'failed';
create or replace function public.commerce_create_order(p_store text,p_user uuid,p_key uuid,p_lines jsonb,p_customer jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s commerce_stores; o commerce_orders; r record; q integer; total integer:=0; snapshot jsonb:='[]'; input jsonb;
begin
 input:=jsonb_build_object('lines',p_lines,'customer',p_customer);
 perform pg_advisory_xact_lock(hashtextextended(p_store||p_user::text||p_key::text,0));
 select * into o from commerce_orders where store_id=p_store and user_id=p_user and request_key=p_key;
 if found then
  if o.request_payload<>input then raise exception 'Idempotency key reused with different details'; end if;
  return to_jsonb(o);
 end if;
 select * into s from commerce_stores where id=p_store for update;
 if not found or not s.launched or not s.checkout_enabled or not s.policies_approved or s.shipping_cents is null then raise exception 'Checkout closed'; end if;
 if s.preorder_order_limit is not null and (select count(*) from commerce_orders where store_id=p_store and status<>'failed')>=s.preorder_order_limit then raise exception 'Preorder batch is full'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>30 then raise exception 'Invalid cart'; end if;
 -- Aggregate duplicates and lock variants in stable order to prevent overselling/deadlocks.
 for r in select (value->>'variantId')::uuid as vid,sum((value->>'qty')::integer)::integer as qty from jsonb_array_elements(p_lines) group by 1 order by 1 loop
  q:=r.qty;
  if q<1 or q>20 then raise exception 'Invalid quantity'; end if;
  select v.*,p.title,p.published,p.demo into r from commerce_variants v join commerce_products p on p.id=v.product_id and p.store_id=v.store_id where v.id=r.vid and v.store_id=p_store for update of v;
  if not found or not r.published or r.demo or r.stock<q then raise exception 'Product unavailable'; end if;
  total:=total+r.price_cents*q;
  update commerce_variants set stock=stock-q where id=r.id and store_id=p_store;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('variantId',r.id,'productId',r.product_id,'title',r.title,'label',r.label,'sku',r.sku,'unitPrice',r.price_cents,'qty',q));
 end loop;
 insert into commerce_orders(store_id,user_id,request_key,request_payload,customer,items,amount_cents,currency)
 values(p_store,p_user,p_key,input,p_customer,snapshot,total+case when (s.free_shipping_threshold_cents is not null and total>=s.free_shipping_threshold_cents) or (p_store='still-form' and exists(select 1 from jsonb_array_elements(snapshot) item where item->>'sku'='CLERLY-NIA5-TRIO')) then 0 else s.shipping_cents end,s.currency) returning * into o;
 return to_jsonb(o);
end $$;