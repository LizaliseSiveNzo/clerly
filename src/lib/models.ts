import { z } from "zod";
export const variantSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(100),
  sku: z.string().min(1).max(100),
  price_cents: z.number().int().positive().max(100000000),
  stock: z.number().int().nonnegative(),
  size: z.string().min(1).max(100),
});
export const productSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  title: z.string().min(2).max(150),
  description: z.string().min(10).max(6000),
  collection: z.enum(["cleanse", "treat", "moisturise"]),
  ingredients: z.string().min(1).max(6000),
  usage: z.string().min(1).max(3000),
  delivery: z.string().min(1).max(2000),
  images: z
    .array(
      z.object({
        url: z
          .string()
          .url()
          .refine((v) => v.startsWith("https://"), "Use HTTPS images."),
        alt: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(12),
  published: z.boolean(),
  demo: z.boolean().default(false),
  variants: z.array(variantSchema).min(1).max(30),
});
export type Product = z.infer<typeof productSchema>;
export type CartLine = {
  storeId: string;
  variantId: string;
  productId: string;
  title: string;
  label: string;
  image: string;
  unitPrice: number;
  qty: number;
};
export function readCart(raw: string | null, storeId: string): CartLine[] {
  try {
    const lines = JSON.parse(raw || "[]");
    return Array.isArray(lines)
      ? lines.filter(
          (v: CartLine) =>
            v.storeId === storeId &&
            typeof v.variantId === "string" &&
            Number.isInteger(v.qty) &&
            v.qty > 0 &&
            v.qty <= 20 &&
            Number.isSafeInteger(v.unitPrice) &&
            v.unitPrice > 0,
        )
      : [];
  } catch {
    return [];
  }
}
