import { storageKey } from "../config";
export const CHECKOUT_DRAFT = storageKey("checkout-draft");
export const PENDING_PAYMENT = storageKey("pending-payment");
export const SESSION_TTL = 2 * 60 * 60 * 1000;

export function readSession<T>(key: string): T | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!saved || Date.now() - saved.savedAt > SESSION_TTL) {
      sessionStorage.removeItem(key);
      return null;
    }
    return saved.value as T;
  } catch {
    return null;
  }
}
export function saveSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    /* Checkout remains usable without browser storage. */
  }
}
