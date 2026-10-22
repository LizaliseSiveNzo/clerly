import {
  useState,
  useRef,
  useEffect,
  type FormEvent,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { store, money, siteUrl } from "./config";
import { api, auth } from "./lib/client";
import { type Product, productSchema } from "./lib/models";
import { CartProvider, useCart } from "./Cart";
import { SalesCatalogProvider, SalesHome, SalesShop, SalesProduct, SalesCart, SalesCheckout, SalesFAQ } from "./PreorderStore";
declare global {
  interface Window {
    fbq?: (command: string, event: string) => void;
  }
}
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
  text = "Explore our 5% Niacinamide Serum and Turmeric Cleansing Bar, with single-item and bundle options.",
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
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next");
  const returnTo = next === "/checkout" || next === "/cart" ? next : "";
  const { items: accountBag } = useCart();
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
    if (!error && returnTo) navigate(returnTo);
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
      <h1>{returnTo ? "One step closer." : "Your account."}</h1>
      {returnTo && <p className="account-return-note">Sign in or create an account to continue. Your bag and delivery details stay saved.</p>}
      {!auth ? (
        <Empty
          title="Accounts are being prepared."
          text="Account access will be available when the collection launches."
        />
      ) : user ? (
        <>
          <p>Signed in as {user}.</p>
          {(returnTo || accountBag.length>0) && <Link className="button" to={returnTo || "/checkout"}>Continue to checkout <Arrow/></Link>}
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
  return <>
    <section className="about-hero"><div><p className="eyebrow">THE THINKING BEHIND CLÉRLY</p><h1>Everyday care.<br/><em>A little more considered.</em></h1><p className="intro">We believe a daily routine can be something you look forward to. A small pause. A familiar ritual. A choice that feels like you.</p><Link className="text-link" to="/shop">Meet the collection <Arrow/></Link></div><img src="/ritual/clerly-bottle-lifestyle.webp" alt="Clérly skincare lifestyle packaging mockup against a sage background" width="1024" height="1536"/></section>
    <section className="section about-manifesto"><p className="eyebrow">OUR POINT OF VIEW</p><h2>Less noise.<br/>More room for <em>you.</em></h2><p>Clérly brings together a flagship 5% Niacinamide Serum and a turmeric cleansing bar. Two distinct formats, with a simple ambition: a considered ritual that feels at home in your everyday routine.</p><p>We start with choice, rather than complication. Explore the details, find your format, and make your routine your own.</p></section>
    <section className="section about-values"><div className="section-heading"><div><p className="eyebrow">WHAT GUIDES US</p><h2>Thoughtful by nature.<br/><em>Clear by choice.</em></h2></div></div><div className="details-grid"><div><span className="principle-number">01</span><h3>Clarity.</h3><p>Product information, price and delivery details should be easy to find and understand. Supplier-confirmed formula information is shared before dispatch.</p></div><div><span className="principle-number">02</span><h3>Individuality.</h3><p>Your routine belongs to you. Choose one essential or a bundle, without a compulsory regimen or subscription.</p></div><div><span className="principle-number">03</span><h3>Consideration.</h3><p>From a focused collection to clear preorder terms and tracked delivery, the small details shape the whole experience.</p></div></div></section>
    <section className="section split-story"><figure className="home-ritual-image"><img src="/serum/clerly-niacinamide-concept.webp" alt="Clérly frosted serum bottle packaging concept with botanical details" width="893" height="1600" loading="lazy"/><figcaption>THE FLAGSHIP / PACKAGING CONCEPT</figcaption></figure><div><p className="eyebrow">THE COLLECTION, CHAPTER ONE</p><h2>A small collection.<br/><em>A world of possibility.</em></h2><p>Meet the serum. Discover the cleansing bar. Find the format that fits your daily life, then take it at your own pace.</p><Link className="button" to="/shop">Find your ritual <Arrow/></Link></div></section>
  </>;
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
  return <div className="page contact-editorial"><div className="collection-title"><p className="eyebrow">HERE TO HELP</p><h1>A little<br/><em>connection.</em></h1><p className="intro">A clear answer is a good place to start.<br/>Find the details for your Clérly order below.</p></div><div className="help-card-grid"><Link to="/faq"><span>01 / YOUR QUESTIONS</span><h2>Good to know.</h2><p>Products, preorders and the details of your daily ritual.</p><span className="text-link">Explore answers <Arrow/></span></Link><Link to="/policies/delivery"><span>02 / YOUR DELIVERY</span><h2>On its way.</h2><p>Dispatch estimates, delivery charges and tracking information.</p><span className="text-link">Delivery details <Arrow/></span></Link><Link to="/policies/returns"><span>03 / PEACE OF MIND</span><h2>Change of plans?</h2><p>Preorder cancellations, unopened returns and your options.</p><span className="text-link">Returns & cancellations <Arrow/></span></Link></div>{store.contactEmail&&<p className="contact-direct">Something else on your mind? <a href={`mailto:${store.contactEmail}`}>{store.contactEmail}</a></p>}<Link className="button" to="/account">Visit your account <Arrow/></Link></div>;
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
      "We use the information you provide to manage your account, process your order and arrange delivery. Your order history is available through your signed-in account.",
      "Payments are handled through Yoco’s hosted checkout. Clérly does not collect or store your card details.",
      "We use cookies and advertising measurement services to understand website visits and improve our advertising. Meta receives page-visit and browser information for this purpose. We do not add your name, email address, delivery address or payment details to these advertising events.",
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
      <div className="footer-invitation"><span>EVERYDAY CARE. CONSIDERED.</span><Link to="/shop">Find your next ritual <Arrow/></Link></div>
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
          Niacinamide &amp; turmeric.
          <br />
          A new chapter in your ritual.
          <br />
          <em>Rooted in ritual.</em>
        </p>
      </div>
      <div className="footer-wordmark" aria-hidden="true">Clérly<span>✦</span></div>
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
  // The base snippet records the initial load; only track subsequent route changes.
  const pixelPath = useRef(location.pathname);
  useEffect(() => {
    if (pixelPath.current === location.pathname) return;
    pixelPath.current = location.pathname;
    window.fbq?.("track", "PageView");
  }, [location.pathname]);
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
