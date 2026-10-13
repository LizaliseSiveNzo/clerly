import brand from "./brand.json";
// Stable store ID is independent of the editable brand name. Never rename the ID.
export const store = brand;
const publicEnv = import.meta.env || {};
export const launched = publicEnv.VITE_STOREFRONT_LAUNCHED === "true";
export function siteUrl() {
  return (
    publicEnv.VITE_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}
export const storageKey = (kind: string, storeId = store.id) =>
  `commerce:${storeId}:${kind}:v1`;
export const money = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: store.currency,
  }).format(cents / 100);
