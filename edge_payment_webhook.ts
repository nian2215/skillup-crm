// Supabase Edge Function: payment-webhook (Thawani)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const THAWANI_KEY = Deno.env.get("THAWANI_SECRET_KEY") || ""
const THAWANI_URL = "https://uatcheckout.thawani.om/api/v1"
const SUPA_URL    = Deno.env.get("SUPABASE_URL") || ""
const SUPA_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

serve(async (req) => {
  try {
    const body       = await req.json()
    const sessionId  = body.session_id || body.data?.session_id
    const status     = body.payment_status // paid / cancelled

    if (!sessionId) return new Response("Missing session_id", { status: 400 })

    // Verify with Thawani API
    const verifyRes = await fetch(`${THAWANI_URL}/checkout/session/${sessionId}`, {
      headers: { "thawani-api-key": THAWANI_KEY }
    })
    const verifyData = await verifyRes.json()
    const session    = verifyData.data

    const userId  = session?.metadata?.user_id
    const plan    = session?.metadata?.plan
    const isPaid  = session?.payment_status === "paid"

    const sb = createClient(SUPA_URL, SUPA_KEY)

    // Update payment record
    await sb.from("payments")
      .update({ status: isPaid ? "paid" : "failed", paid_at: isPaid ? new Date().toISOString() : null })
      .eq("session_id", sessionId)

    if (isPaid && userId && plan) {
      const nextBill = new Date()
      nextBill.setMonth(nextBill.getMonth() + 1)

      await sb.from("profiles").update({
        plan,
        is_active: true,
        trial_end: nextBill.toISOString(),
      }).eq("id", userId)

      console.log(`✅ Payment success! User: ${userId} Plan: ${plan}`)
    }

    return new Response("ok")
  } catch (e) {
    console.error("Webhook error:", e)
    return new Response("Error", { status: 500 })
  }
})
