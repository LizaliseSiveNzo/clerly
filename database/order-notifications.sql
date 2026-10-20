-- Server-only delivery ledger. Existing orders/payment validation are unchanged.
create table public.commerce_order_notifications (
 store_id text not null,
 order_id uuid not null,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sent','needs_review')),
 lease_id uuid, lease_until timestamptz,
 first_attempt_at timestamptz, attempts integer not null default 0,
 message_id text, sent_at timestamptz, last_error text,
 primary key(store_id,order_id),
 foreign key(store_id,order_id) references public.commerce_orders(store_id,id)
);
alter table public.commerce_order_notifications enable row level security;
revoke all on public.commerce_order_notifications from public,anon,authenticated;
grant all on public.commerce_order_notifications to service_role;

create function public.commerce_claim_order_notification(p_store text,p_order uuid,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n commerce_order_notifications;
begin
 if not exists(select 1 from commerce_orders where store_id=p_store and id=p_order and status in ('paid','shipped') and paid_at is not null) then
  return jsonb_build_object('state','ineligible');
 end if;
 insert into commerce_order_notifications(store_id,order_id,payload) values(p_store,p_order,p_payload) on conflict do nothing;
 select * into n from commerce_order_notifications where store_id=p_store and order_id=p_order for update;
 if n.status='sent' then return jsonb_build_object('state','sent'); end if;
 -- Resend retains idempotency keys for24h. Avoid an ambiguous duplicate after expiry.
 if n.status='needs_review' or n.first_attempt_at<now()-interval '23 hours' then
  update commerce_order_notifications set status='needs_review',last_error='Idempotency window expired; check provider delivery before retrying' where store_id=p_store and order_id=p_order;
  return jsonb_build_object('state','needs_review');
 end if;
 if n.lease_until>now() then return jsonb_build_object('state','busy'); end if;
 update commerce_order_notifications set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1
 where store_id=p_store and order_id=p_order returning * into n;
 return jsonb_build_object('state','claimed','lease',n.lease_id,'payload',n.payload);
end $$;
revoke all on function public.commerce_claim_order_notification(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commerce_claim_order_notification(text,uuid,jsonb) to service_role;
