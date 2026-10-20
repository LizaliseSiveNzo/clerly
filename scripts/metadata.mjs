import { readFileSync, writeFileSync } from "node:fs";
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {render} from '../dist-ssr/prerender-entry.js';
const preorderCatalog = JSON.parse(readFileSync("src/preorder-catalog.json", "utf8"));
const brand = JSON.parse(readFileSync("src/brand.json", "utf8"));
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const launch = process.env.VITE_STOREFRONT_LAUNCHED === "true";
const raw =
  process.env.VITE_SITE_URL ||
  process.env.SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
const origin = raw ? new URL(raw).origin : "";
const toRootRelative = (url) => {
  if (typeof url !== "string" || url === "") return url;
  try {
    const u = new URL(url);
    return origin && u.origin === origin ? u.pathname + u.search + u.hash : url;
  } catch {
    return url;
  }
};
const normalizeImages = (product) => ({
  ...product,
  images: Array.isArray(product.images)
    ? product.images.map((image) => ({ ...image, url: toRootRelative(image && image.url) }))
    : product.images,
});
let catalog={products:[],checkoutEnabled:false,ready:false};
if(launch){
 if(!origin.startsWith('https://')||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Launch needs an HTTPS canonical URL and server database configuration.');
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:settings,error:settingsError}=await db.from('commerce_stores').select('launched').eq('id',brand.id).single();
 if(settingsError||!settings?.launched)throw new Error('Registry is not launched; keep the coming-soon build enabled.');
 const {data:products,error}=await db.from('commerce_products').select('id,slug,title,description,collection,ingredients,usage,delivery,images,published,demo,variants:commerce_variants(id,label,sku,size,price_cents,stock)').eq('store_id',brand.id).eq('published',true).eq('demo',false);
 if(error)throw new Error('Could not load public launch products.');
 catalog={products:(products||[]).map(normalizeImages),checkoutEnabled:false,ready:true};
}
if (launch && !origin)
  throw new Error("Set the canonical SITE_URL before indexing.");
let html = readFileSync("dist/index.html", "utf8");
html = html
  .replace(
    /<title>.*?<\/title>/,
    `<title>${escape(brand.name)} â€” ${escape(brand.tagline)}</title>`,
  )
  .replace(
    /<meta name="description" content="[^"]*"\/>/,
    `<meta name="description" content="${escape(brand.description)}"/>`,
  );
if (launch)
  html = html.replace('content="noindex,nofollow"', 'content="index,follow"');
if (origin)
  html = html.replace(
    "</head>",
    `<link rel="canonical" href="${escape(origin)}/"/><meta property="og:title" content="${escape(brand.name)} â€” ${escape(brand.tagline)}"/><meta property="og:description" content="${escape(brand.description)}"/><meta property="og:url" content="${escape(origin)}/"/></head>`,
  );
writeFileSync("dist/index.html", html);
writeFileSync(
  "dist/robots.txt",
  launch
    ? `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /admin\nDisallow: /checkout\nDisallow: /api\nSitemap: ${origin}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n",
);
const routes = launch
  ? [
      "/",
      "/shop",
      "/about",
      "/faq",
      "/contact",
      "/policies/delivery",
      "/policies/returns",
      "/policies/privacy",
      "/policies/terms",
    ]
  : [];
if(launch) routes.push(...catalog.products.map(product=>`/products/${product.slug}`));
const upcomingRoutes=preorderCatalog.products.filter(product=>!catalog.products.some(live=>live.id===product.id)).map(product=>`/products/${product.slug}`);
const publicRoutes=['/','/shop','/about','/faq','/contact','/policies/delivery','/policies/returns','/policies/privacy','/policies/terms',...catalog.products.map(product=>`/products/${product.slug}`)];
const allRoutes=[...publicRoutes,...upcomingRoutes,'/cart','/checkout','/account','/admin','/404'];
const publicData=JSON.stringify(catalog).replaceAll('<','\\u003c');
for(const path of allRoutes){
 const product=preorderCatalog.products.find(p=>path===`/products/${p.slug}`);
 const title=product?`${product.title} Â· ${brand.name}`:path==='/'?`${brand.name} â€” ${brand.tagline}`:`${path.slice(1).replaceAll('/',' Â· ')} Â· ${brand.name}`;
 let page=html.replace(/<title>.*?<\/title>/,`<title>${escape(title)}</title>`);
 if(origin)page=page.replaceAll(`${escape(origin)}/\"`,`${escape(origin+path)}\"`);
 if(launch&&!publicRoutes.includes(path))page=page.replace('content="index,follow"','content="noindex,nofollow"');
 page=page.replace('<div id="root"></div>',`<div id="root">${render(path,catalog)}</div><script type="application/json" id="public-catalog">${publicData}</script>`);
 const file=path==='/'?'dist/index.html':`dist${path}.html`;
 mkdirSync(dirname(file),{recursive:true});writeFileSync(file,page);
}
console.log(`Pre-rendered ${allRoutes.length} pages. Search indexing ${launch?'enabled for public pages':'disabled'}.`);
writeFileSync(
  "dist/sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`,
);
