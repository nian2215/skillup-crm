// Supabase Edge Function: payment-webhook (Thawani) — Secured
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const THAWANI_KEY    = Deno.env.get("THAWANI_SECRET_KEY") || ""
const THAWANI_URL    = "https://uatcheckout.thawani.om/api/v1"
const SUPA_URL       = Deno.env.get("SUPABASE_URL") || ""
const SUPA_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || ""

serve(async (req) => {
  try {
    // ── 1. التحقق من مصدر الـ Webhook بـ secret header ──
    const incomingSecret = req.headers.get("x-webhook-secret") ?? ""
    if (WEBHOOK_SECRET && incomingSecret !== WEBHOOK_SECRET) {
      console.error("Webhook: invalid secret")
      return new Response("Forbidden", { status: 403 })
    }

    const body      = await req.json()
    const sessionId = body.session_id || body.data?.session_id

    if (!sessionId) return new Response("Missing session_id", { status: 400 })

    const sb = createClient(SUPA_URL, SUPA_KEY)

    // ── 2. Idempotency — تجاهل إذا سبق المعالجة ──
    const { data: payment } = await sb
      .from("payments")
      .select("status, user_id, plan")
      .eq("session_id", sessionId)
      .maybeSingle()

    if (!payment) {
      console.error("Webhook: unknown session_id", sessionId)
      return new Response("Not found", { status: 404 })
    }

    if (payment.status === "paid") {
      console.log("Webhook: already processed", sessionId)
      return new Response("ok") // idempotent
    }

    // ── 3. التحقق من حالة الدفع مباشرة مع Thawani — لا نثق بالـ body ──
    const verifyRes = await fetch(`${THAWANI_URL}/checkout/session/${sessionId}`, {
      headers: { "thawani-api-key": THAWANI_KEY },
    })

    if (!verifyRes.ok) {
      console.error("Webhook: Thawani verify failed", await verifyRes.text())
      return new Response("Verification failed", { status: 502 })
    }

    const verifyData = await verifyRes.json()
    const session    = verifyData.data
    const isPaid     = session?.payment_status === "paid"

    // ── 4. تحديث سجل الدفع ──
    await sb
      .from("payments")
      .update({
        status:  isPaid ? "paid" : "failed",
        paid_at: isPaid ? new Date().toISOString() : null,
      })
      .eq("session_id", sessionId)

    // ── 5. تفعيل الاشتراك فقط إذا الدفع ناجح ──
    if (isPaid) {
      const userId = session.metadata?.user_id
      const plan   = session.metadata?.plan

      if (!userId || !plan) {
        console.error("Webhook: missing metadata", { userId, plan })
        return new Response("Bad metadata", { status: 422 })
      }

      // تأكد أن user_id في الـ metadata يطابق السجل في DB
      if (userId !== payment.user_id) {
        console.error("Webhook: user_id mismatch!", { metadata: userId, db: payment.user_id })
        return new Response("Forbidden", { status: 403 })
      }

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

  } catch (e: any) {
    console.error("Webhook error:", e)
    return new Response("Internal error", { status: 500 })
  }
})
