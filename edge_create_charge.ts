// Supabase Edge Function: create-charge (Thawani)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const THAWANI_KEY  = Deno.env.get("THAWANI_SECRET_KEY") || ""
const THAWANI_URL  = "https://uatcheckout.thawani.om/api/v1"  // sandbox
// const THAWANI_URL = "https://checkout.thawani.om/api/v1"   // production
const SUPA_URL     = Deno.env.get("SUPABASE_URL") || ""
const SUPA_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

const PLANS = {
  basic:      { name: "SkillUp CRM - اساسي",   amount: 1500 }, // in Baisas (15 OMR * 100)
  pro:        { name: "SkillUp CRM - احترافي",  amount: 3500 },
  enterprise: { name: "SkillUp CRM - شركات",    amount: 8000 },
}

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const { plan, user_id, email, success_url, cancel_url } = await req.json()

    if (!plan || !PLANS[plan]) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), { status: 400, headers: CORS })
    }

    const p = PLANS[plan]

    // Create Thawani session
    const thawaniRes = await fetch(`${THAWANI_URL}/checkout/session`, {
      method: "POST",
      headers: {
        "thawani-api-key": THAWANI_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_reference_id: `${user_id}_${plan}_${Date.now()}`,
        mode: "payment",
        products: [{
          name: p.name,
          quantity: 1,
          unit_amount: p.amount,
        }],
        success_url: success_url || "https://yourdomain.com/success",
        cancel_url:  cancel_url  || "https://yourdomain.com/cancel",
        metadata: { user_id, plan, email },
      })
    })

    const data = await thawaniRes.json()

    if (!thawaniRes.ok || !data.data?.session_id) {
      throw new Error(data.description || "Thawani error")
    }

    // Save pending payment
    const sb = createClient(SUPA_URL, SUPA_KEY)
    await sb.from("payments").insert({
      user_id, plan,
      amount: p.amount / 100,
      currency: "OMR",
      session_id: data.data.session_id,
      status: "pending",
    })

    // Return checkout URL
    const checkoutUrl = `${THAWANI_URL.replace('/api/v1', '')}/pay/${data.data.session_id}?key=${THAWANI_KEY}`

    return new Response(JSON.stringify({
      payment_url: checkoutUrl,
      session_id:  data.data.session_id,
    }), { headers: { ...CORS, "Content-Type": "application/json" } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
  }
})
