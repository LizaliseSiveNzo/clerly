import {
  useState,
  useEffect,
  type FormEvent,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { store, money, siteUrl } from "./config";
import { api, auth } from "./lib/client";
import { type Product, productSchema } from "./lib/models";
import { CartProvider, useCart } from "./Cart";
import { SalesCatalogProvider, SalesHome, SalesShop, SalesProduct, SalesCart, SalesCheckout, SalesFAQ } from "./PreorderStore";
export type Catalog = {
  products: Product[];
  checkoutEnabled: boolean;
  ready: boolean;
  shippingCents?: number;
};
function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
function Empty({
  title = "Our first collection is in the making.",
  text = "Turmeric bars, solid African black soap and liquid African black soap. Product details and availability will be shared before launch.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <span className="seed" aria-hidden="true">
        ✳
      </span>
      <p className="eyebrow">IN THE MAKING</p>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="text-link" to="/">
        Back to {store.name} <Arrow />
      </Link>
    </div>
  );
}
function Header() {
  const { items } = useCart();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <>
      <div className="announcement">
        Clérly flagship serum · Preorder · Free delivery with the serum trio
      </div>
      <header>
        <Link to="/" className="wordmark" aria-label={`${store.name} home`}>
          <img src="/clerly-logo-moss.png" alt={store.name} width={2036} height={772} />
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <nav
          id="navigation"
          className={open ? "open" : ""}
          aria-label="Main navigation"
        >
          <NavLink to="/shop">The collection</NavLink>
          <NavLink to="/about">Our approach</NavLink>
          <NavLink to="/faq">Good to know</NavLink>
        </nav>
        <div className="header-actions">
          <Link to="/account" aria-label="Your account">
            <svg
              width="20"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden="true"
            >
              <circle cx="12" cy="7" r="3.5" />
              <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
            </svg>
          </Link>
          <Link
            to="/cart"
            aria-label={`Bag, ${items.reduce((n, v) => n + v.qty, 0)} offers`}
          >
            Bag{" "}
            <span className="bag-count">
              {items.reduce((n, v) => n + v.qty, 0)}
            </span>
          </Link>
        </div>
      </header>
    </>
  );
}
type Order = {
  id: string;
  status: string;
  amount_cents: number;
  created_at: string;
  items: { title: string; label: string; qty: number }[];
};
function Account() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState("");
  const [message, setMessage] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!auth) return;
    const subscription = auth.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user.email || ""),
    );
    void auth.auth
      .getSession()
      .then((v) => setUser(v.data.session?.user.email || ""));
    return () => subscription.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user)
      void api<{ orders: Order[] }>("orders")
        .then((v) => setOrders(v.orders))
        .catch((e) => setMessage(e.message));
    else setOrders([]);
  }, [user]);
  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setBusy(true);
    const { error } = await auth.auth.signInWithPassword({ email, password });
    setMessage(
      error ? "Could not sign in. Check your email and password." : "",
    );
    setBusy(false);
  }
  async function signUp() {
    if (!auth) return;
    setBusy(true);
    const { error } = await auth.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrl()}/account` },
    });
    setMessage(
      error
        ? "Account creation unavailable. Please try again."
        : "Check your email to confirm your account.",
    );
    setBusy(false);
  }
  return (
    <div className="page narrow">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Your account.</h1>
      {!auth ? (
        <Empty
          title="Accounts are being prepared."
          text="Account access will be available when the collection launches."
        />
      ) : user ? (
        <>
          <p>Signed in as {user}.</p>
          <button
            className="text-link"
            onClick={() => void auth?.auth.signOut()}
          >
            Sign out
          </button>
          <h2>Your {store.name} orders</h2>
          <p>
            Payment redirects do not confirm payment. Refresh orders to check
            confirmation.
          </p>
          <button
            className="text-link"
            onClick={() =>
              void api<{ orders: Order[] }>("orders")
                .then((v) => setOrders(v.orders))
                .catch((e) => setMessage(e.message))
            }
          >
            Refresh orders
          </button>
          {orders.length ? (
            orders.map((o) => (
              <article className="order" key={o.id}>
                <p>Order {o.id}</p>
                <h3>
                  {o.status} · {money(o.amount_cents)}
                </h3>
                {o.items.map((v, i) => (
                  <p key={i}>
                    {v.qty} × {v.title} · {v.label}
                  </p>
                ))}
              </article>
            ))
          ) : (
            <p>You have no orders in this store yet.</p>
          )}
        </>
      ) : (
        <>
          <p>
            Use your existing customer sign-in, or create an account. This page
            shows only your {store.name} orders.
          </p>
          <form onSubmit={signIn}>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                minLength={8}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              Sign in <Arrow />
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy || !email || password.length < 8}
              onClick={() => void signUp()}
            >
              Create an account
            </button>
          </form>
        </>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
function About() {
  return (
    <div className="page narrow">
      <p className="eyebrow">OUR APPROACH</p>
      <h1>
        African roots.
        <br />
        <em>Everyday ritual.</em>
      </h1>
      <p className="intro">
        Familiar ingredients. Clear choices. A ritual you can make your own.
      </p>
      <p>
        {store.name} brings its flagship 5% Niacinamide Serum together with turmeric bars, solid
        African black soap and liquid African black soap. Four choices,
        with a simple ambition: a considered ritual that feels at
        home in your everyday routine.
      </p>
      <h2>Know what goes into your ritual.</h2>
      <p>We believe choosing skincare should start with the details: what’s inside, how it’s intended to be used, and what you can reasonably expect from it. Our product pages will share that information as each formula is confirmed.</p>
      <h2>Clarity before everything.</h2>
      <p>
        Before each product arrives, you’ll be able to explore its ingredients,
        sizes, available options, price and delivery information. We’ll share
        product-specific information as our range is confirmed.
      </p>
      <h2>Your choice, your pace.</h2>
      <p>Start with the product that fits your preferences. Our solid and liquid black soap formats are choices to explore, rather than steps you have to combine.</p>
      <h2>Thoughtful from product to delivery.</h2>
      <p>Choose a single item or a multipack, see the full price before payment, and follow your delivery after dispatch. A good ritual starts with a clear choice.</p>
      <Link className="button" to="/shop">
        Find your format <Arrow />
      </Link>
    </div>
  );
}
function FAQ() {
  return (
    <div className="page narrow">
      <p className="eyebrow">GOOD TO KNOW</p>
      <h1>Choose with confidence.</h1>
      <p className="intro">Your products, preorder and delivery. The details before your first ritual.</p>
      <SalesFAQ />
    </div>
  );
}
function Contact() {
  return (
    <div className="page narrow">
      <p className="eyebrow">LET’S TALK</p>
      <h1>A little connection.</h1>
      <p className="intro">We’re preparing our customer support channels.</p>
      {store.contactEmail ? (
        <a className="text-link" href={`mailto:${store.contactEmail}`}>
          {store.contactEmail}
        </a>
      ) : (
        <p>Our contact details will be published here before orders open.</p>
      )}
      <Link className="text-link" to="/faq">
        Read our frequently asked questions <Arrow />
      </Link>
    </div>
  );
}
const policyContent: Record<string, [string, string[]]> = {
  delivery: [
    "Delivery",
    [
      "South African delivery is R79 per order, or free with the three-bottle serum bundle or on product totals of R900 or more. All amounts are shown in rands before payment.",
      "This is a preorder collection. Estimated dispatch is 15–20 business days after payment confirmation. Estimated courier transit is 2–5 business days after dispatch. Business days exclude weekends and public holidays; these are estimates rather than guaranteed arrival dates.",
      "Tracking is provided after dispatch. Check your address before payment. If the dispatch estimate changes, we will inform you and offer cancellation before dispatch for a full refund.",
    ],
  ],
  returns: [
    "Returns",
    [
      "Cancel a preorder before dispatch for a full refund to the original payment method. After dispatch, unopened, unused products in their original packaging may be returned within 30 days of delivery under our voluntary change-of-mind policy.",
      "Contact support before returning an item to obtain return instructions and the correct return address. For voluntary change-of-mind returns, the customer pays return courier costs. Refunds are processed to the original payment method after the return is reviewed; payment-provider processing times may apply.",
      "If an item is faulty, damaged or incorrect, contact us with your order number and photographs so we can arrange a remedy and appropriate return costs. The unopened-product condition does not limit rights relating to defective goods. Applicable statutory cancellation, refund and consumer rights remain unaffected.",
    ],
  ],
  privacy: [
    "Privacy",
    [
      "This policy is being prepared before launch.",
      "Customer identities use the same authentication service as our related store. This storefront restricts order access to the signed-in customer and this store.",
      "Before orders open, we will publish the business identity, privacy contact, retention periods, processors, customer rights and consent information.",
    ],
  ],
  terms: [
    "Terms",
    [
      "All displayed offers are one-time purchases in South African rands. Bundle savings compare the displayed multipack price with the cost of buying the same number of single items. There is no automatic subscription.",
      "Products are preorders, with estimated dispatch in 15–20 business days and courier transit in 2–5 business days after dispatch. Read the delivery and returns policies before payment. You may cancel before dispatch for a full refund.",
      "Yoco hosts the payment step. An order is confirmed only after successful payment verification. If payment fails, the order is not confirmed. Do not treat a browser redirect alone as confirmation of payment.",
      "Packaging images are placeholders. The final product size, ingredients and directions must be confirmed before paid ordering is activated. Product claims are limited to supported cosmetic information; individual experiences may vary.",
      "Seller identity and customer support details will be published before payment activation. Statutory consumer rights remain unaffected.",
    ],
  ],
};
function Policy() {
  const { kind } = useParams();
  const content = policyContent[kind || ""];
  return (
    <div className="page narrow">
      <p className="eyebrow">STORE INFORMATION</p>
      <h1>{content?.[0] || "Page not found"}.</h1>
      {content?.[1].map((text) => (
        <p key={text}>{text}</p>
      ))}
    </div>
  );
}
const productTemplate = {
  id: "<product-uuid>",
  slug: "<product-slug>",
  title: "<product-name>",
  description: "<description>",
  collection: "cleanse",
  ingredients: "<supplier-confirmed-ingredient-list>",
  usage: "<supplier-confirmed-directions>",
  delivery: "<confirmed-product-delivery-details>",
  images: [
    {
      url: "https://<image-host>/<store-id>/products/<product-id>/front.webp",
      alt: "<accurate-image-description>",
    },
  ],
  published: false,
  demo: false,
  variants: [
    {
      id: "<variant-uuid>",
      label: "<variant-label>",
      sku: "<unique-sku>",
      size: "<size>",
      price_cents: 0,
      stock: 0,
    },
  ],
};
function Admin() {
  const [text, setText] = useState(JSON.stringify(productTemplate, null, 2));
  const [products, setProducts] = useState<Product[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const result = await api<{ products: Product[] }>("admin/products");
      setProducts(result.products);
      setMessage("Catalogue loaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const product = productSchema.parse(JSON.parse(text));
      await api("admin/products", product);
      setMessage("Product saved. Publish only confirmed real products.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Check the product data.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <p className="eyebrow">STORE ADMINISTRATION</p>
      <h1>Collection studio.</h1>
      <p>
        Selected store: {store.name} ({store.id}). Your account needs membership
        for this store.
      </p>
      <Link className="text-link" to="/account">
        Sign in →
      </Link>
      <button className="text-link" disabled={busy} onClick={() => void load()}>
        Load products
      </button>
      <div className="admin-grid">
        <div>
          <h2>Products</h2>
          {products.map((p) => (
            <button
              className="admin-product"
              key={p.id}
              onClick={() => setText(JSON.stringify(p, null, 2))}
            >
              {p.title} · {p.published ? "Published" : "Draft"}
            </button>
          ))}
          <p>
            Use UUIDs for product and variant IDs. Prices are integer ZAR cents.
            Images must use HTTPS and descriptive alt text.
          </p>
          <p>
            The site remains closed until the store’s launch settings and
            payment setup are complete.
          </p>
        </div>
        <form onSubmit={save}>
          <label htmlFor="product-json">Product data</label>
          <textarea
            id="product-json"
            rows={27}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <button className="button" disabled={busy}>
            Save product <Arrow />
          </button>
        </form>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <div>
          <Link to="/" className="wordmark">
            <img src="/clerly-logo-moss.png" alt={store.name} width={2036} height={772} />
          </Link>
          <p>{store.tagline}</p>
        </div>
        <div>
          <p className="eyebrow">EXPLORE</p>
          <Link to="/shop">The collection</Link>
          <Link to="/about">Our approach</Link>
          <Link to="/faq">Good to know</Link>
        </div>
        <div>
          <p className="eyebrow">HERE TO HELP</p>
          <Link to="/contact">Contact</Link>
          <Link to="/policies/delivery">Delivery</Link>
          <Link to="/policies/returns">Returns</Link>
        </div>
        <p className="footer-note">
          Niacinamide, turmeric &amp; black soap.
          <br />
          A new chapter in your ritual.
          <br />
          <em>Rooted in ritual.</em>
        </p>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {store.name}
        </span>
        <div>
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/terms">Terms</Link>
        </div>
        <span>African roots. Everyday ritual.</span>
      </div>
    </footer>
  );
}
function Site({ initialCatalog }: { initialCatalog?: Catalog }) {
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog || {
    products: [],
    checkoutEnabled: false,
    ready: false,
  });
  const location = useLocation();
  useEffect(() => {
    let alive = true;
    void api<Catalog>("catalog")
      .then((data) => {
        if (alive) setCatalog(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${location.pathname === "/" ? store.tagline : location.pathname.split("/").filter(Boolean).join(" · ")} · ${store.name}`;
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${siteUrl()}${location.pathname}`;
    document.querySelector("main")?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <SalesCatalogProvider data={catalog}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<SalesHome />} />
          <Route path="/shop" element={<SalesShop />} />
          <Route path="/products/:slug" element={<SalesProduct />} />
          <Route path="/cart" element={<SalesCart />} />
          <Route path="/checkout" element={<SalesCheckout />} />
          <Route path="/account" element={<Account />} />
          <Route path="/about" element={<About />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/policies/:kind" element={<Policy />} />
          <Route path="/admin" element={<Admin />} />
          <Route
            path="*"
            element={
              <div className="page">
                <Empty
                  title="This page is taking a different path."
                  text="We couldn’t find that page. Return home to explore."
                />
              </div>
            }
          />
        </Routes>
      </main>
      <Footer />
    </SalesCatalogProvider>
  );
}
export default function App({ initialCatalog }: { initialCatalog?: Catalog }) {
  return (
    <CartProvider>
      <Site initialCatalog={initialCatalog} />
    </CartProvider>
  );
}
