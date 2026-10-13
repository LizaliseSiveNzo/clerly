import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { customerSchema } from "../src/lib/customer.js";
import { productSchema } from "../src/lib/models.js";
import { STORE_ID, siteOrigin, checkoutOpen } from "./settings.js";
import { verifyYocoSignature } from "./yoco-signature.js";
import { preorderQuote } from "./preorder-quote.js";
import { PREORDER_TERMS_VERSION } from "../src/lib/preorder-terms.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Input = { path: string; method: string; headers: Headers; raw: string };
export const checkoutSchema = z
  .object({
    requestKey: z.string().uuid(),
    lines: z
      .array(
        z
          .object({
            variantId: z.string().uuid(),
            qty: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    customer: customerSchema,
    termsAccepted: z.literal(true),
    termsVersion: z.literal(PREORDER_TERMS_VERSION),
  })
  .strict();
export const paymentEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["payment.succeeded", "payment.failed"]),
  payload: z
    .object({
      id: z.string().min(1),
      amount: z.number().int().positive(),
      currency: z.literal("ZAR"),
      mode: z.enum(["test", "live"]),
      metadata: z.object({ checkoutId: z.string().min(1) }).passthrough(),
    })
    .passthrough(),
});
export async function service(input: Input) {
  const { path, method, headers, raw } = input;
  if (path === "preorder-quote" && method === "POST" && !checkoutOpen()) {
    try { return preorderQuote(JSON.parse(raw)); }
    catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : "Check your bag.");
    }
  }
  if (path === "checkout" && !checkoutOpen())
    throw new HttpError(
      409,
      "Yoco payment activation is pending. Your bag is saved and no payment has been taken.",
    );
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (path === "catalog" && method === "GET")
      return { products: [], checkoutEnabled: false, ready: false };
    throw new HttpError(
      503,
      "This service is being prepared. Please check back soon.",
    );
  }
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const check = (error: unknown) => {
    if (error) throw new HttpError(503, "Service temporarily unavailable.");
  };
  if (path === "yoco-webhook" && method === "POST") {
    const secret = process.env.YOCO_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "Webhook signing is not configured.");
    if (!(await verifyYocoSignature(raw, secret, headers)))
      throw new HttpError(401, "Invalid signature.");
    const parsed = JSON.parse(raw);
    if (!["payment.succeeded", "payment.failed"].includes(parsed.type))
      return { ignored: true };
    const event = paymentEventSchema.parse(parsed);
    const p = event.payload;
    if (!process.env.YOCO_MODE || p.mode !== process.env.YOCO_MODE)
      throw new HttpError(400, "Payment mode mismatch.");
    // Ignore unrelated checkout IDs received through an account-wide webhook.
    const { data: order, error: readError } = await db
      .from("commerce_orders")
      .select("id")
      .eq("store_id", STORE_ID)
      .eq("checkout_id", p.metadata.checkoutId)
      .maybeSingle();
    check(readError);
    if (!order) return { ignored: true };
    const { data, error } = await db.rpc("commerce_apply_payment", {
      p_store: STORE_ID,
      p_event: event.id,
      p_checkout: p.metadata.checkoutId,
      p_payment: p.id,
      p_amount: p.amount,
      p_currency: p.currency,
      p_success: event.type === "payment.succeeded",
      p_payload: event,
    });
    check(error);
    return { result: data };
  }
  if ((path === "catalog" && method === "GET") || (path === "preorder-quote" && method === "POST")) {
    const { data: settings, error: settingsError } = await db
      .from("commerce_stores")
      .select("launched,checkout_enabled,shipping_cents,free_shipping_threshold_cents,policies_approved")
      .eq("id", STORE_ID)
      .single();
    check(settingsError);
    if (!settings) throw new HttpError(503, "Store setup incomplete.");
    const { data: products, error } = await db
      .from("commerce_products")
      .select("*,variants:commerce_variants(*)")
      .eq("store_id", STORE_ID)
      .eq("published", true)
      .eq("demo", false)
      .order("title");
    check(error);
    if (path === "preorder-quote") {
      if (!settings.launched || settings.shipping_cents === null)
        throw new HttpError(409, "Live catalogue is not ready for payment.");
      const validated = z.array(productSchema).parse(products);
      try { return preorderQuote(JSON.parse(raw), {products:validated,shippingCents:settings.shipping_cents,freeShippingThresholdCents:settings.free_shipping_threshold_cents ?? null,enforceStock:true}); }
      catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) throw error;
        throw new HttpError(400, error instanceof Error ? error.message : "Check your bag.");
      }
    }
    return {
      products: settings.launched ? products : [],
      checkoutEnabled:
        checkoutOpen() &&
        settings.launched &&
        settings.checkout_enabled &&
        settings.policies_approved &&
        settings.shipping_cents !== null,
      shippingCents: settings.shipping_cents,
      freeShippingThresholdCents: settings.free_shipping_threshold_cents,
      ready: true,
    };
  }
  const token = headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new HttpError(401, "Sign in to continue.");
  const { data: identity, error: authError } = await db.auth.getUser(token);
  if (authError || !identity.user || identity.user.is_anonymous)
    throw new HttpError(401, "Sign in to continue.");
  const user = identity.user;
  if (path === "orders" && method === "GET") {
    const { data, error } = await db
      .from("commerce_orders")
      .select("id,status,items,amount_cents,currency,created_at")
      .eq("store_id", STORE_ID)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    check(error);
    return { orders: data };
  }
  if (path === "checkout" && method === "POST") {
    if (
      !process.env.YOCO_SECRET_KEY ||
      !process.env.YOCO_WEBHOOK_SECRET ||
      !["test", "live"].includes(process.env.YOCO_MODE || "")
    )
      throw new HttpError(503, "Payment setup is not complete.");
    const body = checkoutSchema.parse(JSON.parse(raw));
    if (body.customer.email.toLowerCase() !== user.email?.toLowerCase())
      throw new HttpError(400, "Use the email address you signed in with.");
    const { data: order, error } = await db.rpc("commerce_create_order", {
      p_store: STORE_ID,
      p_user: user.id,
      p_key: body.requestKey,
      p_lines: body.lines,
      p_customer: { ...body.customer, termsAccepted: body.termsAccepted, termsVersion: body.termsVersion },
    });
    if (error)
      throw new HttpError(
        409,
        "Checkout is closed or an item is unavailable. Refresh your cart.",
      );
    if (order.status !== "pending")
      throw new HttpError(409, "This order has already been processed.");
    if (order.redirect_url)
      return { orderId: order.id, redirectUrl: order.redirect_url };
    const origin = siteOrigin();
    const response = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.YOCO_SECRET_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${STORE_ID}:${order.id}`,
      },
      body: JSON.stringify({
        amount: order.amount_cents,
        currency: order.currency,
        successUrl: `${origin}/account?payment=success`,
        cancelUrl: `${origin}/checkout?payment=cancelled`,
        failureUrl: `${origin}/checkout?payment=failed`,
        metadata: { storeId: STORE_ID, orderId: order.id },
        externalId: order.id,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new HttpError(
        502,
        "Payment could not start. Your details are saved; retry the same checkout.",
      );
    const payment = await response.json();
    const url = new URL(payment.redirectUrl);
    if (
      !payment.id ||
      url.protocol !== "https:" ||
      !(url.hostname === "yoco.com" || url.hostname.endsWith(".yoco.com"))
    )
      throw new HttpError(502, "Invalid payment response.");
    const { error: saveError } = await db
      .from("commerce_orders")
      .update({ checkout_id: payment.id, redirect_url: url.href })
      .eq("store_id", STORE_ID)
      .eq("user_id", user.id)
      .eq("id", order.id);
    check(saveError);
    return { orderId: order.id, redirectUrl: url.href };
  }
  if (path.startsWith("admin/")) {
    const { data: member, error } = await db
      .from("commerce_store_members")
      .select("user_id")
      .eq("store_id", STORE_ID)
      .eq("user_id", user.id)
      .maybeSingle();
    check(error);
    if (!member)
      throw new HttpError(403, "Store administrator access required.");
    if (path === "admin/products" && method === "GET") {
      const { data, error } = await db
        .from("commerce_products")
        .select("*,variants:commerce_variants(*)")
        .eq("store_id", STORE_ID)
        .order("title");
      check(error);
      return { products: data };
    }
    if (path === "admin/products" && method === "POST") {
      const product = productSchema.parse(JSON.parse(raw));
      const { error } = await db.rpc("commerce_save_product", {
        p_store: STORE_ID,
        p_product: product,
      });
      check(error);
      return { saved: true };
    }
  }
  throw new HttpError(404, "Page not found.");
}
