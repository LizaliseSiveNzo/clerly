import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { store, storageKey } from "./config";
import { readCart, type CartLine } from "./lib/models";
type CartValue = {
  items: CartLine[];
  add: (line: CartLine) => void;
  quantity: (id: string, n: number) => void;
  clear: () => void;
};
const Context = createContext<CartValue | null>(null);
// Adapted from RevID CartContext: persisted lines, quantity edits and selective removal.
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>(() => {
    try {
      return readCart(localStorage.getItem(storageKey("cart")), store.id);
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey("cart"), JSON.stringify(items));
    } catch {
      /* In-memory cart stays usable. */
    }
  }, [items]);
  return (
    <Context.Provider
      value={{
        items,
        add(line) {
          if (line.storeId !== store.id) return;
          setItems((prev) => {
            const old = prev.find((v) => v.variantId === line.variantId);
            return old
              ? prev.map((v) =>
                  v.variantId === line.variantId
                    ? { ...v, qty: Math.min(20, v.qty + line.qty) }
                    : v,
                )
              : [...prev, line];
          });
        },
        quantity(id, n) {
          setItems((prev) =>
            n <= 0
              ? prev.filter((v) => v.variantId !== id)
              : prev.map((v) =>
                  v.variantId === id ? { ...v, qty: Math.min(20, n) } : v,
                ),
          );
        },
        clear() {
          setItems([]);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCart() {
  const value = useContext(Context);
  if (!value) throw new Error("CartProvider required");
  return value;
}
