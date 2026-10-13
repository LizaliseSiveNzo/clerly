import { z } from "zod";
import catalog from "../src/preorder-catalog.json" with { type: "json" };
export const quoteSchema = z.object({ lines: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(20) }).strict()).min(1).max(30) }).strict();
type QuoteProduct = {title:string;images:{url:string}[];variants:{id:string;label:string;price_cents:number;stock?:number}[]};
type QuoteCatalog = {products:QuoteProduct[];shippingCents:number;freeShippingThresholdCents:number|null;enforceStock?:boolean};
export function preorderQuote(input: unknown, source: QuoteCatalog = catalog) {
  const { lines } = quoteSchema.parse(input);
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.variantId, (totals.get(line.variantId) || 0) + line.qty);
  const items = [...totals].map(([variantId, qty]) => {
    if (qty > 20) throw new Error("Quantity exceeds the limit.");
    const product = source.products.find(p => p.variants.some(v => v.id === variantId));
    const variant = product?.variants.find(v => v.id === variantId);
    if (!product || !variant) throw new Error("This item is no longer available.");
    if (source.enforceStock && qty > (variant.stock ?? 0)) throw new Error(`${product.title}: your quantity exceeds the available allocation. Please update your bag.`);
    return { variantId, qty, title: product.title, label: variant.label, unitPrice: variant.price_cents, amount: qty * variant.price_cents, image: product.images[0].url };
  });
  const subtotal = items.reduce((n, i) => n + i.amount, 0);
  const shipping = source.freeShippingThresholdCents !== null && subtotal >= source.freeShippingThresholdCents ? 0 : source.shippingCents;
  return { items, subtotal, shipping, total: subtotal + shipping, currency: "ZAR", dispatch: catalog.dispatch, transit: catalog.transit, freeShippingThresholdCents:source.freeShippingThresholdCents };
}
