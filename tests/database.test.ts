import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
it("executes additive schema, policies, authoritative orders, inventory and idempotent payment routing in isolated PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean);
   create table public.orders(id uuid primary key,total_amount integer);
   create table public.reviews(id uuid primary key);
   insert into public.orders values('00000000-0000-4000-8000-000000000001',900);
   insert into auth.users values('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');`);
    await db.exec(readFileSync("database/proposed-shared-schema.sql", "utf8"));
    await db.exec(readFileSync("database/serum-trio-delivery.sql", "utf8"));
    await db.exec(readFileSync("database/shared-preorder-cap.sql", "utf8"));
    expect(
      (
        await db.query<{ store_id: string; total_amount: number }>(
          "select store_id,total_amount from orders",
        )
      ).rows,
    ).toEqual([{ store_id: "revid", total_amount: 900 }]);
    const user = "00000000-0000-4000-8000-000000000002";
    const other = "00000000-0000-4000-8000-000000000003";
    const product = "00000000-0000-4000-8000-000000000004";
    const variant = "00000000-0000-4000-8000-000000000005";
    await db.query("select commerce_save_product($1,$2)", [
      "still-form",
      JSON.stringify({
        id: product,
        slug: "local-only-test",
        title: "Local test",
        description: "Test fixture only",
        collection: "cleanse",
        ingredients: "Fixture",
        usage: "Fixture",
        delivery: "Fixture",
        images: [],
        published: true,
        demo: false,
        variants: [
          {
            id: variant,
            label: "Fixture",
            sku: "TEST",
            size: "100 ml",
            price_cents: 12500,
            stock: 5,
          },
        ],
      }),
    ]);
    await db.exec(
      "update commerce_stores set launched=true,checkout_enabled=true,policies_approved=true,shipping_cents=500 where id='still-form'",
    );
    const lines = JSON.stringify([{ variantId: variant, qty: 2 }]);
    const customer = JSON.stringify({ email: "fixture@example.test" });
    const key = crypto.randomUUID();
    const create = (store: string, userId = user, k = key, body = lines) =>
      db.query<{ order: Record<string, unknown> }>(
        'select commerce_create_order($1,$2,$3,$4,$5) as "order"',
        [store, userId, k, body, customer],
      );
    const order = (await create("still-form")).rows[0].order;
    expect(order.amount_cents).toBe(25500);
    expect((await create("still-form")).rows[0].order.id).toBe(order.id);
    expect(
      (await db.query<{ stock: number }>("select stock from commerce_variants"))
        .rows[0].stock,
    ).toBe(3);
    await expect(
      create(
        "still-form",
        user,
        key,
        JSON.stringify([{ variantId: variant, qty: 1 }]),
      ),
    ).rejects.toThrow();
    await expect(
      create(
        "still-form",
        other,
        crypto.randomUUID(),
        JSON.stringify([{ variantId: variant, qty: 4 }]),
      ),
    ).rejects.toThrow();
    await db.exec(
      "update commerce_stores set launched=true,checkout_enabled=true,policies_approved=true,shipping_cents=0 where id='revid'",
    );
    await expect(create("revid")).rejects.toThrow();
    await db.query(
      "update commerce_orders set checkout_id='ch-local' where id=$1",
      [order.id],
    );
    const payment = (
      store: string,
      id: string,
      amount = 25500,
      currency = "ZAR",
      success = true,
    ) =>
      db.query<{ result: string }>(
        "select commerce_apply_payment($1,$2,$3,$4,$5,$6,$7,$8) as result",
        [store, id, "ch-local", "pay-local", amount, currency, success, "{}"],
      );
    expect((await payment("revid", "evt-other")).rows[0].result).toBe(
      "unmatched",
    );
    await expect(payment("still-form", "evt-wrong", 1)).rejects.toThrow();
    await expect(
      payment("still-form", "evt-currency", 25500, "USD"),
    ).rejects.toThrow();
    expect((await payment("still-form", "evt-local")).rows[0].result).toBe(
      "processed",
    );
    expect((await payment("still-form", "evt-local")).rows[0].result).toBe(
      "duplicate",
    );
    expect(
      (await payment("still-form", "evt-new", 25500, "ZAR", false)).rows[0]
        .result,
    ).toBe("already-final");
    expect(
      (await db.query<{ status: string }>("select status from commerce_orders"))
        .rows[0].status,
    ).toBe("paid");
    expect((await db.query("select * from orders")).rows).toHaveLength(1);
    const second = (
      await create(
        "still-form",
        other,
        crypto.randomUUID(),
        JSON.stringify([{ variantId: variant, qty: 1 }]),
      )
    ).rows[0].order;
    await db.query(
      "update commerce_orders set checkout_id='ch-failed' where id=$1",
      [second.id],
    );
    await db.query("select commerce_apply_payment($1,$2,$3,$4,$5,$6,$7,$8)", [
      "still-form",
      "evt-failed",
      "ch-failed",
      "pay-failed",
      13000,
      "ZAR",
      false,
      "{}",
    ]);
    expect(
      (await db.query<{ stock: number }>("select stock from commerce_variants"))
        .rows[0].stock,
    ).toBe(3);
    await db.exec("update commerce_stores set free_shipping_threshold_cents=25000 where id='still-form'");
    const freeDeliveryOrder = (await create("still-form", other, crypto.randomUUID(), lines)).rows[0].order;
    expect(freeDeliveryOrder.amount_cents).toBe(25000);
    await db.exec("update commerce_stores set free_shipping_threshold_cents=90000 where id='still-form'");
    await db.query("update commerce_variants set sku='CLERLY-NIA5-TRIO',price_cents=49900 where id=$1",[variant]);
    const trioLines=JSON.stringify([{variantId:variant,qty:1}]);
    const trioKey=crypto.randomUUID();
    const trioOrder=(await create("still-form",user,trioKey,trioLines)).rows[0].order;
    expect(trioOrder.amount_cents).toBe(49900);
    expect((await create("still-form",user,trioKey,trioLines)).rows[0].order.id).toBe(trioOrder.id);
    await db.exec("update commerce_variants set stock=20; update commerce_stores set preorder_order_limit=(select count(*)+1 from commerce_orders where store_id='still-form' and status<>'failed') where id='still-form'");
    const capKey=crypto.randomUUID();
    const lastOrder=(await create("still-form",user,capKey,trioLines)).rows[0].order;
    expect((await create("still-form",user,capKey,trioLines)).rows[0].order.id).toBe(lastOrder.id);
    await expect(create("still-form",other,crypto.randomUUID(),trioLines)).rejects.toThrow("Preorder batch is full");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("select * from commerce_orders")).rejects.toThrow();
      await expect(create("still-form")).rejects.toThrow();
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
}, 30000);
