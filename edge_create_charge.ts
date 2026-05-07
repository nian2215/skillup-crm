// Supabase Edge Function: create-charge (Thawani) — Secured
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const THAWANI_KEY = Deno.env.get("THAWANI_SECRET_KEY") || ""
const THAWANI_URL = "https://uatcheckout.thawani.om/api/v1"  // sandbox
// const THAWANI_URL = "https://checkout.thawani.om/api/v1"  // production
const SUPA_URL    = Deno.env.get("SUPABASE_URL") || ""
const SUPA_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const APP_URL     = Deno.env.get("APP_URL") || "https://yourdomain.com"

const PLANS: Record<string, { name: string; amount: number }> = {
  basic:      { name: "SkillUp CRM - اساسي",  amount: 1500 },
  pro:        { name: "SkillUp CRM - احترافي", amount: 3500 },
  enterprise: { name: "SkillUp CRM - شركات",   amount: 8000 },
}

const CORS = {
  "Access-Control-Allow-Origin":  APP_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    // ── 1. استخراج user_id من JWT — لا نثق بالـ body أبداً ──
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS })
    }
    const token = authHeader.replace("Bearer ", "")

    const sb = createClient(SUPA_URL, SUPA_KEY)
    const { data: { user }, error: authError } = await sb.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS })
    }

    const user_id = user.id       // مأخوذ من JWT — لا يمكن تزويره
    const email   = user.email ?? ""

    // ── 2. التحقق من الخطة ──
    const { plan } = await req.json()
    if (!plan || !PLANS[plan]) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), { status: 400, headers: CORS })
    }
    const p = PLANS[plan]

    // ── 3. التحقق من عدم وجود دفع pending حالي لنفس المستخدم ──
    const { data: existing } = await sb
      .from("payments")
      .select("id")
      .eq("user_id", user_id)
      .eq("status", "pending")
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ error: "لديك طلب دفع معلّق بالفعل" }),
        { status: 409, headers: CORS }
      )
    }

    // ── 4. إنشاء جلسة Thawani ──
    const success_url = `${APP_URL}/skillup_crm.html?payment=success`
    const cancel_url  = `${APP_URL}/skillup_payment.html`

    const thawaniRes = await fetch(`${THAWANI_URL}/checkout/session`, {
      method: "POST",
      headers: {
        "thawani-api-key": THAWANI_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_reference_id: `${user_id}_${plan}_${Date.now()}`,
        mode: "payment",
        products: [{ name: p.name, quantity: 1, unit_amount: p.amount }],
        success_url,
        cancel_url,
        metadata: { user_id, plan, email },
      }),
    })

    const data = await thawaniRes.json()
    if (!thawaniRes.ok || !data.data?.session_id) {
      throw new Error(data.description || "Thawani error")
    }

    // ── 5. حفظ سجل الدفع ──
    const { error: insertError } = await sb.from("payments").insert({
      user_id,
      plan,
      amount:     p.amount / 100,
      currency:   "OMR",
      session_id: data.data.session_id,
      status:     "pending",
    })

    if (insertError) throw new Error("DB insert failed")

    const checkoutUrl = `${THAWANI_URL.replace("/api/v1", "")}/pay/${data.data.session_id}?key=${THAWANI_KEY}`

    return new Response(
      JSON.stringify({ payment_url: checkoutUrl, session_id: data.data.session_id }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    )

  } catch (e: any) {
    console.error("create-charge error:", e)
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: CORS })
  }
})
