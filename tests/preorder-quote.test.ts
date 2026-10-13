import {expect,it} from "vitest";
import {preorderQuote} from "../server/preorder-quote";
import catalog from "../src/preorder-catalog.json";
const single = catalog.products[0].variants[0].id;
const bundle = catalog.products[0].variants[2].id;
it("uses server prices and delivery, rather than cached cart values",()=>{
  expect(preorderQuote({lines:[{variantId:single,qty:1}]})).toMatchObject({subtotal:44853,shipping:7900,total:52753});
  expect(()=>preorderQuote({lines:[{variantId:single,qty:1,price:1}]})).toThrow();
});
it("uses multipack prices and grants free shipping at the threshold",()=>{
  expect(preorderQuote({lines:[{variantId:bundle,qty:1}]})).toMatchObject({subtotal:91025,shipping:0,total:91025});
  const source={products:catalog.products,shippingCents:7900,freeShippingThresholdCents:89706};
  expect(preorderQuote({lines:[{variantId:single,qty:2}]},source).shipping).toBe(0);
  expect(preorderQuote({lines:[{variantId:single,qty:2}]},{...source,freeShippingThresholdCents:89707}).shipping).toBe(7900);
});
it("aggregates duplicate lines and rejects quantity-limit bypasses",()=>{
  const quote=preorderQuote({lines:[{variantId:single,qty:1},{variantId:single,qty:2}]});
  expect(quote.items).toHaveLength(1);expect(quote.items[0].qty).toBe(3);
  expect(()=>preorderQuote({lines:[{variantId:single,qty:20},{variantId:single,qty:1}]})).toThrow();
  for(const qty of [0,-1,1.5,21])expect(()=>preorderQuote({lines:[{variantId:single,qty}]})).toThrow();
});
it("rejects unknown variants and empty bags",()=>{
  expect(()=>preorderQuote({lines:[{variantId:"00000000-0000-4000-8000-000000000001",qty:1}]})).toThrow();
  expect(()=>preorderQuote({lines:[]})).toThrow();
});
it("uses the activated database catalogue when supplied",()=>{
  const source={products:[{...catalog.products[0],variants:[{...catalog.products[0].variants[0],price_cents:32000}]}],shippingCents:6500,freeShippingThresholdCents:null};
  expect(preorderQuote({lines:[{variantId:single,qty:3}]},source)).toMatchObject({subtotal:96000,shipping:6500,total:102500});
  expect(()=>preorderQuote({lines:[{variantId:single,qty:3}]},{...source,enforceStock:true})).toThrow("allocation");
});
