import { describe, it, expect, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { verifyYocoSignature } from "../server/yoco-signature";
import { checkoutSchema, paymentEventSchema, service } from "../server/service";
import { siteOrigin } from "../server/settings";
import { storageKey } from "../src/config";
import { readCart } from "../src/lib/models";
describe("store and payment boundary", () => {
  const customer = {
    fullName: "Test Customer",
    email: "customer@example.test",
    phone: "0821234567",
    streetAddress: "1 Test Street",
    suburb: "",
    city: "Cape Town",
    province: "Western Cape",
    postalCode: "8000",
    notes: "",
  };
  it("namespaces carts and rejects another store’s saved lines", () => {
    expect(storageKey("cart", "revid")).not.toBe(
      storageKey("cart", "still-form"),
    );
    expect(
      readCart(
        JSON.stringify([
          { storeId: "revid", variantId: "a", qty: 1, unitPrice: 100 },
        ]),
        "still-form",
      ),
    ).toEqual([]);
    expect(readCart("not-json", "still-form")).toEqual([]);
  });
  it("rejects caller prices and store selection instead of accepting authority from a client", () => {
    const valid = {
      requestKey: crypto.randomUUID(),
      lines: [{ variantId: crypto.randomUUID(), qty: 1 }],
      customer,
      termsAccepted: true,
      termsVersion: "blkd-preorder-v1",
    };
    expect(checkoutSchema.safeParse(valid).success).toBe(true);
    expect(checkoutSchema.safeParse({...valid,termsAccepted:false}).success).toBe(false);
    expect(checkoutSchema.safeParse({...valid,termsVersion:"obsolete"}).success).toBe(false);
    expect(
      checkoutSchema.safeParse({ ...valid, storeId: "revid" }).success,
    ).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, amount: 1 }).success).toBe(
      false,
    );
    expect(
      checkoutSchema.safeParse({
        ...valid,
        lines: [{ variantId: crypto.randomUUID(), qty: -1 }],
      }).success,
    ).toBe(false);
  });
  it("uses a configured server origin rather than request-controlled redirect URLs", () => {
    expect(siteOrigin({ SITE_URL: "https://skincare.example.test/path" })).toBe(
      "https://skincare.example.test",
    );
    expect(() => siteOrigin({ NODE_ENV: "production" })).toThrow();
    expect(() =>
      siteOrigin({ SITE_URL: "http://attacker.test", NODE_ENV: "production" }),
    ).toThrow();
  });
  it("fails closed before database/payment calls in coming-soon mode", async () => {
    await expect(
      service({
        path: "checkout",
        method: "POST",
        headers: new Headers(),
        raw: "{}",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("verifies signed raw events, supports key rotation, and rejects tampering and replays", async () => {
    const secret =
      "whsec_" + Buffer.from("local-test-secret").toString("base64");
    const now = String(Math.floor(Date.now() / 1000));
    const raw = '{"type":"payment.succeeded"}';
    const signed = createHmac("sha256", Buffer.from("local-test-secret"))
      .update(`evt-test.${now}.${raw}`)
      .digest("base64");
    const headers = new Headers({
      "webhook-id": "evt-test",
      "webhook-timestamp": now,
      "webhook-signature": `v1,wrong v1,${signed}`,
    });
    expect(await verifyYocoSignature(raw, secret, headers)).toBe(true);
    expect(await verifyYocoSignature(raw + " ", secret, headers)).toBe(false);
    headers.set("webhook-timestamp", "0");
    expect(await verifyYocoSignature(raw, secret, headers)).toBe(false);
    headers.set("webhook-timestamp", "NaN");
    expect(await verifyYocoSignature(raw, secret, headers)).toBe(false);
  });
  it("parses the documented Yoco payload and requires its stored checkout reference", () => {
    const event = {
      id: "evt-local",
      type: "payment.succeeded",
      payload: {
        id: "pay-local",
        amount: 12500,
        currency: "ZAR",
        mode: "test",
        metadata: { checkoutId: "ch-local" },
      },
    };
    expect(paymentEventSchema.safeParse(event).success).toBe(true);
    expect(
      paymentEventSchema.safeParse({
        ...event,
        payload: { ...event.payload, currency: "USD" },
      }).success,
    ).toBe(false);
  });
});
