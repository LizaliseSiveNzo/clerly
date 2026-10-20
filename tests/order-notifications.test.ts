import {afterEach,expect,it,vi} from "vitest";
import {createClient} from "@supabase/supabase-js";
import {createHmac} from "node:crypto";
import {ownerOrderEmail,notifyOwnerOfPaidOrder} from "../server/order-notifications";
import {service} from "../server/service";
const order={id:"00000000-0000-4000-8000-000000000111",status:"paid",amount_cents:42800,currency:"ZAR",paid_at:"2026-10-20T11:00:00Z",customer:{fullName:"Local Test Customer",email:"customer@example.test",phone:"0821234567",streetAddress:"1 Test Street",suburb:"",city:"Cape Town",province:"Western Cape",postalCode:"8000",notes:"Ring the bell"},items:[{title:"Clérly 5% Niacinamide Serum",label:"Duo · 2 × 50ml",sku:"CLERLY-NIA5-DUO",unitPrice:34900,qty:1}]};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
function fixture(status="paid",failFirst=false) {
  vi.stubEnv("ORDER_NOTIFICATION_EMAIL","owner@example.test");vi.stubEnv("RESEND_API_KEY","test-only-email-key");
  let sent=false;let attempts=0;let paid=status;const sequence:string[]=[];const emails:{body:unknown;key:string|null}[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const request=input instanceof Request?input:null;const url=new URL(request?.url||String(input));const method=request?.method||init?.method||"GET";
    const raw=request?await request.text():String(init?.body||"{}");const body=raw?JSON.parse(raw):{};
    if(url.pathname==="/rest/v1/commerce_orders")return Response.json(url.searchParams.get("select")==="id"?{id:order.id}:{...order,status:paid});
    if(url.pathname==="/rest/v1/rpc/commerce_apply_payment"){sequence.push("payment");paid=body.p_success?"paid":"failed";return Response.json("duplicate")}
    if(url.pathname==="/rest/v1/rpc/commerce_claim_order_notification")return Response.json(sent?{state:"sent"}:{state:"claimed",lease:"00000000-0000-4000-8000-000000000222",payload:body.p_payload});
    if(url.hostname==="api.resend.com"){
      sequence.push("email");attempts++;emails.push({body,key:new Headers(request?.headers||init?.headers).get("Idempotency-Key")});
      return attempts===1&&failFirst?Response.json({error:"transient"},{status:429}):Response.json({id:"test-email-id"});
    }
    if(url.pathname==="/rest/v1/commerce_order_notifications"&&method==="PATCH"){
      if(body.status==="sent"){sent=true;return Response.json({order_id:order.id})}
      return new Response(null,{status:204});
    }
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`);
  }));
  return {db:createClient("https://database.example.test","test-server-key"),emails,sequence};
}
it("renders paid items, correct delivery/total and customer address as plain text to the server recipient",()=>{
  const mail=ownerOrderEmail(order,"owner@example.test");
  expect(mail.to).toEqual(["owner@example.test"]);expect(mail.reply_to).toBe(order.customer.email);
  for(const value of [order.id,"Duo · 2 × 50ml","349","79","428","1 Test Street","8000","Ring the bell","15–20 business days"])expect(mail.text).toContain(value);
  expect(()=>ownerOrderEmail({...order,status:"pending"},"owner@example.test")).toThrow();
});
it("persists acceptance and skips later webhook retries without another email",async()=>{
  const f=fixture();await notifyOwnerOfPaidOrder(f.db,order.id);await notifyOwnerOfPaidOrder(f.db,order.id);
  expect(f.emails).toHaveLength(1);expect(f.emails[0].key).toBe(`clerly-owner-paid/still-form/${order.id}`);
});
it("leaves failed delivery retryable and uses the identical key/payload on retry",async()=>{
  const f=fixture("paid",true);await expect(notifyOwnerOfPaidOrder(f.db,order.id)).rejects.toThrow("429");
  await notifyOwnerOfPaidOrder(f.db,order.id);expect(f.emails).toHaveLength(2);expect(f.emails[0]).toEqual(f.emails[1]);
});
it("does not send for pending or failed checkouts",async()=>{
  for(const status of ["pending","failed"]){const f=fixture(status);await notifyOwnerOfPaidOrder(f.db,order.id);expect(f.emails).toHaveLength(0)}
});
it("only notifies after the signed successful payment RPC; a delivery failure returns503 for provider retry",async()=>{
  const f=fixture("pending",true);
  vi.stubEnv("SUPABASE_URL","https://database.example.test");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test-server-key");vi.stubEnv("YOCO_MODE","live");
  const secret=Buffer.from("test-local-signing-secret");vi.stubEnv("YOCO_WEBHOOK_SECRET",`whsec_${secret.toString("base64")}`);
  const event={id:"evt-local",type:"payment.succeeded",payload:{id:"pay-local",amount:42800,currency:"ZAR",mode:"live",metadata:{checkoutId:"ch-local"}}};
  const raw=JSON.stringify(event);const timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac("sha256",secret).update(`evt-local.${timestamp}.${raw}`).digest("base64");
  const input={path:"yoco-webhook",method:"POST",raw,headers:new Headers({"webhook-id":"evt-local","webhook-timestamp":timestamp,"webhook-signature":`v1,${signature}`})};
  await expect(service(input)).rejects.toMatchObject({status:503});expect(f.sequence).toEqual(["payment","email"]);
  await service(input);expect(f.emails).toHaveLength(2);await service(input);expect(f.emails).toHaveLength(2);
});
