import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STORE_ID } from "./settings.js";
import catalog from "../src/preorder-catalog.json" with { type: "json" };

const paidOrderSchema = z.object({
  id: z.string().uuid(), status: z.enum(["paid", "shipped"]),
  amount_cents: z.number().int().positive(), currency: z.literal("ZAR"),
  paid_at: z.string().datetime({offset:true}),
  customer: z.object({fullName:z.string(),email:z.string().email(),phone:z.string(),streetAddress:z.string(),suburb:z.string(),city:z.string(),province:z.string(),postalCode:z.string(),notes:z.string()}),
  items: z.array(z.object({title:z.string(),label:z.string(),sku:z.string(),unitPrice:z.number().int().positive(),qty:z.number().int().positive()})).min(1),
});
const emailSchema = z.object({from:z.string(),to:z.array(z.string().email()).length(1),subject:z.string(),text:z.string(),reply_to:z.string().email()});
export function ownerOrderEmail(input:unknown,recipient:string) {
  const order=paidOrderSchema.parse(input);
  const c=order.customer;
  const money=(cents:number)=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(cents/100);
  const subtotal=order.items.reduce((sum,item)=>sum+item.unitPrice*item.qty,0);
  if(subtotal>order.amount_cents)throw new Error("Invalid order total");
  const paid=new Intl.DateTimeFormat("en-ZA",{timeZone:"Africa/Johannesburg",dateStyle:"medium",timeStyle:"short"}).format(new Date(order.paid_at));
  return emailSchema.parse({
    from:"Clérly Orders <orders@clerly.co.za>",to:[recipient],reply_to:c.email,
    subject:`New paid Clérly order ${order.id} — ${money(order.amount_cents)}`,
    text:["NEW PAID CLÉRLY ORDER",`Order: ${order.id}`,`Paid: ${paid} (South Africa)`,"Payment confirmed by Yoco.","", "ITEMS",
      ...order.items.map(item=>`${item.qty} × ${item.title} — ${item.label}\nSKU: ${item.sku} | ${money(item.unitPrice)} each | ${money(item.unitPrice*item.qty)}`),
      "",`Subtotal: ${money(subtotal)}`,`Delivery: ${money(order.amount_cents-subtotal)}`,`Total paid: ${money(order.amount_cents)}`,"","CUSTOMER",
      c.fullName,c.email,c.phone,"","DELIVER TO",c.streetAddress,c.suburb,`${c.city}, ${c.province}, ${c.postalCode}`,"South Africa",
      "",`Delivery notes: ${c.notes||"None"}`,"",`Preorder dispatch estimate: ${catalog.dispatch}.`,"This is a paid preorder, not a dispatch confirmation. Reply to this email to contact the customer.",
    ].filter(line=>line!==undefined).join("\n"),
  });
}

/** Called after the verified payment transaction, including on duplicate webhook retries. */
export async function notifyOwnerOfPaidOrder(db:SupabaseClient,orderId:string) {
  const recipient=process.env.ORDER_NOTIFICATION_EMAIL;
  // Enable only when the server recipient is configured; never use browser input.
  if(!recipient)return;
  const {data:order,error}=await db.from("commerce_orders").select("id,status,amount_cents,currency,paid_at,customer,items").eq("store_id",STORE_ID).eq("id",orderId).maybeSingle();
  if(error)throw new Error("Order notification lookup failed");
  if(!order||!["paid","shipped"].includes(order.status)||!order.paid_at)return;
  const payload=ownerOrderEmail(order,recipient);
  if(!process.env.RESEND_API_KEY)throw new Error("Order email credentials are not configured");
  const {data:claim,error:claimError}=await db.rpc("commerce_claim_order_notification",{p_store:STORE_ID,p_order:orderId,p_payload:payload});
  if(claimError)throw new Error("Order notification reservation failed");
  if(claim?.state==="sent"||claim?.state==="ineligible")return;
  if(claim?.state!=="claimed")throw new Error("Order notification awaits retry or delivery review");
  const lease=z.string().uuid().parse(claim.lease);
  const saved=emailSchema.parse(claim.payload);
  let messageId:string;
  try {
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":`clerly-owner-paid/${STORE_ID}/${orderId}`},
      body:JSON.stringify(saved),signal:AbortSignal.timeout(8000),
    });
    if(!response.ok)throw new Error(`Email provider HTTP ${response.status}`);
    messageId=z.object({id:z.string().min(1)}).parse(await response.json()).id;
  } catch(error) {
    // Leave durable pending work for Yoco's retry; never undo the paid order.
    await db.from("commerce_order_notifications").update({lease_id:null,lease_until:null,last_error:"Email delivery request failed"}).eq("store_id",STORE_ID).eq("order_id",orderId).eq("lease_id",lease);
    throw error;
  }
  const {data:marked,error:markError}=await db.from("commerce_order_notifications").update({status:"sent",message_id:messageId,sent_at:new Date().toISOString(),lease_id:null,lease_until:null,last_error:null}).eq("store_id",STORE_ID).eq("order_id",orderId).eq("lease_id",lease).select("order_id").single();
  if(markError||!marked)throw new Error("Email delivery acknowledgement could not be saved");
}
