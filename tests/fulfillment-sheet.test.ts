import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

it("adds only paid orders to the private sheet, keeps packing progress, and removes refunds from the queue", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
      create table public.orders(id uuid primary key,total_amount integer);
      create table public.reviews(id uuid primary key);`);
    await db.exec(readFileSync("database/proposed-shared-schema.sql", "utf8"));
    const uid = "00000000-0000-4000-8000-000000000001";
    const oid = "00000000-0000-4000-8000-000000000002";
    await db.query("insert into auth.users values($1)",[uid]);
    await db.query(`insert into commerce_orders(id,store_id,user_id,request_key,request_payload,customer,items,amount_cents,currency)
      values($1,'still-form',$2,$1,'{}',$3,$4,42800,'ZAR')`,[oid,uid,JSON.stringify({fullName:"Fixture Only",email:"fixture@example.test",phone:"000",streetAddress:"Fixture Street",suburb:"Fixture Suburb",city:"Fixture",province:"Fixture",postalCode:"0000",notes:"Fixture note"}),JSON.stringify([{title:"Serum",label:"Duo · 2 × 50ml",sku:"CLERLY-NIA5-DUO",qty:1,unitPrice:34900}])]);
    await db.exec(readFileSync("supabase/migrations/20261022143541_order_management.sql","utf8"));
    expect((await db.query("select * from clerly_fulfillment_sheet")).rows).toHaveLength(0);
    await db.query("update commerce_orders set status='paid',paid_at='2026-10-22T12:00:00Z',payment_id='fixture-payment' where id=$1",[oid]);
    const row=(await db.query<any>("select * from clerly_fulfillment_sheet")).rows[0];
    expect(row.customer_name).toBe("Fixture Only");
    expect(row.suburb).toBe("Fixture Suburb");
    expect(row.customer_delivery_notes).toBe("Fixture note");
    expect(Number(row.order_total_zar)).toBe(428);
    expect(Number(row.delivery_charge_zar)).toBe(79);
    expect(row.items_to_pack).toContain("Duo · 2 × 50ml");
    expect((await db.query("select * from clerly_orders_to_fulfill")).rows).toHaveLength(1);
    await db.query("update clerly_fulfillment_sheet set fulfillment_status='packing',internal_notes='Packed carefully' where order_id=$1",[oid]);
    await db.query("update commerce_orders set status='paid' where id=$1",[oid]);
    expect((await db.query<any>("select fulfillment_status,internal_notes from clerly_fulfillment_sheet")).rows[0]).toEqual({fulfillment_status:"packing",internal_notes:"Packed carefully"});
    await expect(db.query("update clerly_fulfillment_sheet set fulfillment_status='shipped' where order_id=$1",[oid])).rejects.toThrow("courier");
    await db.query("update clerly_fulfillment_sheet set courier='Fixture Courier',tracking_number='FIXTURE',fulfillment_status='shipped' where order_id=$1",[oid]);
    expect((await db.query("select * from clerly_orders_to_fulfill")).rows).toHaveLength(0);
    expect((await db.query<any>("select shipped_at from clerly_fulfillment_sheet")).rows[0].shipped_at).toBeTruthy();
    await db.query("update clerly_fulfillment_sheet set fulfillment_status='delivered' where order_id=$1",[oid]);
    expect((await db.query<any>("select delivered from clerly_fulfillment_stats")).rows[0].delivered).toBe(1);
    await db.query("update commerce_orders set status='refunded' where id=$1",[oid]);
    expect((await db.query<any>("select refunded,paid_orders from clerly_fulfillment_stats")).rows[0]).toEqual({refunded:1,paid_orders:0});
    expect((await db.query<any>("select count(*)::integer as n from clerly_fulfillment_history")).rows[0].n).toBe(4);
    expect((await db.query<any>("select has_table_privilege('anon','clerly_fulfillment_sheet','select') as allowed")).rows[0].allowed).toBe(false);
    expect((await db.query<any>("select has_table_privilege('authenticated','clerly_orders_to_fulfill','select') as allowed")).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 20000);

