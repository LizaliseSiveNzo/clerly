import brand from "../src/brand.json" with { type: "json" };
export const STORE_ID = brand.id;
export function siteOrigin(env: NodeJS.ProcessEnv = process.env) {
  const raw =
    env.SITE_URL ||
    (env.VERCEL_URL
      ? `https://${env.VERCEL_URL}`
      : env.NODE_ENV === "production"
        ? ""
        : "http://127.0.0.1:5173");
  if (!raw) throw new Error("SITE_URL required");
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("Invalid site URL");
  return url.origin;
}
export const checkoutOpen = () =>
  process.env.CHECKOUT_ENABLED === "true" &&
  process.env.STOREFRONT_LAUNCHED === "true";
