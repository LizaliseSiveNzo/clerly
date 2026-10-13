import { it, expect, vi, afterEach } from "vitest";
import { service } from "../server/service";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup() {
  vi.stubEnv("SUPABASE_URL", "https://database.example.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-server-key");
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url || String(input));
      const raw = request ? await request.text() : String(init?.body || "{}");
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {}
      requests.push({ url, body });
      if (url.pathname === "/auth/v1/user")
        return Response.json({
          id: "00000000-0000-4000-8000-000000000002",
          email: "customer@example.test",
          is_anonymous: false,
        });
      if (
        url.pathname === "/rest/v1/commerce_orders" &&
        (request?.method || init?.method || "GET") === "GET"
      ) {
        const all = [
          {
            id: "own",
            store_id: "still-form",
            user_id: "00000000-0000-4000-8000-000000000002",
          },
          {
            id: "other-store",
            store_id: "revid",
            user_id: "00000000-0000-4000-8000-000000000002",
          },
          {
            id: "other-user",
            store_id: "still-form",
            user_id: "00000000-0000-4000-8000-000000000003",
          },
        ];
        return Response.json(
          all.filter(
            (v) =>
              `eq.${v.store_id}` === url.searchParams.get("store_id") &&
              `eq.${v.user_id}` === url.searchParams.get("user_id"),
          ),
        );
      }
      if (url.pathname === "/rest/v1/commerce_store_members")
        return Response.json(null);
      if (url.pathname === "/rest/v1/rpc/commerce_create_order")
        return Response.json({
          id: "order-local",
          status: "pending",
          amount_cents: 13000,
          currency: "ZAR",
        });
      if (url.host === "payments.yoco.com")
        return Response.json({
          id: "ch-local",
          redirectUrl: "https://c.yoco.com/checkout/local",
        });
      return new Response(null, { status: 204 });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return requests;
}
const headers = new Headers({ Authorization: "Bearer test-user-token" });
it("shared customer identity cannot retrieve another store’s orders or another customer’s records", async () => {
  setup();
  const result = await service({
    path: "orders",
    method: "GET",
    headers,
    raw: "",
  });
  expect(result).toEqual({
    orders: [
      {
        id: "own",
        store_id: "still-form",
        user_id: "00000000-0000-4000-8000-000000000002",
      },
    ],
  });
});
it("rejects unauthenticated customer data access and a customer accessing the admin catalogue", async () => {
  setup();
  await expect(
    service({ path: "orders", method: "GET", headers: new Headers(), raw: "" }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    service({ path: "admin/products", method: "GET", headers, raw: "" }),
  ).rejects.toMatchObject({ status: 403 });
});
it("provider checkout uses the stored amount, fixed store metadata, server URL and order idempotency", async () => {
  const calls = setup();
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("STOREFRONT_LAUNCHED", "true");
  vi.stubEnv("YOCO_SECRET_KEY", "test-provider-key");
  vi.stubEnv("YOCO_WEBHOOK_SECRET", "test-webhook-key");
  vi.stubEnv("YOCO_MODE", "test");
  vi.stubEnv("SITE_URL", "https://skincare.example.test");
  const request = {
    requestKey: crypto.randomUUID(),
    termsAccepted: true,
    termsVersion: "blkd-preorder-v1",
    lines: [{ variantId: crypto.randomUUID(), qty: 1 }],
    customer: {
      fullName: "Test Customer",
      email: "customer@example.test",
      phone: "0821234567",
      streetAddress: "1 Test Street",
      suburb: "",
      city: "Cape Town",
      province: "Western Cape",
      postalCode: "8000",
      notes: "",
    },
  };
  const result = await service({
    path: "checkout",
    method: "POST",
    headers,
    raw: JSON.stringify(request),
  });
  expect(result).toEqual({
    orderId: "order-local",
    redirectUrl: "https://c.yoco.com/checkout/local",
  });
  const payment = calls.find((v) => v.url.host === "payments.yoco.com")!;
  expect(payment.body.amount).toBe(13000);
  expect(calls.find(v=>v.url.pathname==="/rest/v1/rpc/commerce_create_order")?.body.p_customer).toMatchObject({termsAccepted:true,termsVersion:"blkd-preorder-v1"});
  expect(payment.body.currency).toBe("ZAR");
  expect(payment.body.metadata).toEqual({
    storeId: "still-form",
    orderId: "order-local",
  });
  expect(payment.body.successUrl).toBe(
    "https://skincare.example.test/account?payment=success",
  );
  const saved = calls.find(
    (v) => v.url.pathname === "/rest/v1/commerce_orders" && v.body.checkout_id,
  )!;
  expect(saved.url.searchParams.get("store_id")).toBe("eq.still-form");
  await expect(
    service({
      path: "checkout",
      method: "POST",
      headers,
      raw: JSON.stringify({ ...request, amount: 1 }),
    }),
  ).rejects.toThrow();
});
