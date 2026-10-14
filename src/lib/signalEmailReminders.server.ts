import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSignalDueSoon } from "./signalReminder";
import { reminderTestUser, signalEmailPayload, hasActiveSignalDelivery } from "./signalDelivery";
const db = supabaseAdmin as unknown as SupabaseClient;
type Claim = {
  order_id: string;
  user_id: string;
  expires_at: string;
  claim_id: string;
  email: string;
};

export async function sendSignalEmailReminders() {
  const testUser = reminderTestUser(process.env);
  if (
    process.env.SIGNAL_EMAIL_REMINDERS_ENABLED !== "true" ||
    process.env.SIGNAL_EMAIL_PREFERENCES_ENABLED !== "true"
  )
    return { disabled: true };
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SIGNAL_REMINDER_EMAIL_FROM;
  if (!key || !from) throw new Error("email_configuration_missing");
  const { data, error } = await db.rpc("claim_signal_email_reminders", {
    _limit: 5,
    _user_id: testUser,
  });
  if (error) throw new Error("email_claim_failed");
  const claims = (data || []) as Claim[];
  const results = { claimed: claims.length, sent: 0, skipped: 0, failed: 0 };
  async function finish(item: Claim, status: "sent" | "skipped" | "failed") {
    const { error } = await db
      .from("signal_email_deliveries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("order_id", item.order_id)
      .eq("expires_at", item.expires_at)
      .eq("claim_id", item.claim_id);
    if (error) throw new Error("email_result_not_saved");
  }
  // Sequential requests avoid a burst against provider rate limits.
  for (const item of claims) {
    try {
      const [orderResult, preferenceResult, userResult, pushResult] = await Promise.all([
        db
          .from("orders")
          .select(
            "user_id,payment_status,delivery_status,reservation_expires_at,signal_amount,down_payment,total_price",
          )
          .eq("id", item.order_id)
          .maybeSingle(),
        db
          .from("signal_email_preferences")
          .select("enabled,email")
          .eq("user_id", item.user_id)
          .maybeSingle(),
        db.auth.admin.getUserById(item.user_id),
        db
          .from("signal_reminder_deliveries")
          .select("status,updated_at")
          .eq("order_id", item.order_id)
          .eq("expires_at", item.expires_at)
          .in("status", ["sending", "sent"]),
      ]);
      if (orderResult.error || preferenceResult.error || userResult.error || pushResult.error)
        throw new Error("email_recheck_failed");
      const order = orderResult.data;
      const preference = preferenceResult.data;
      const user = userResult.data.user;
      const amount =
        order &&
        Math.min(
          Number(order.total_price),
          Math.max(Number(order.signal_amount || 0), Number(order.down_payment || 0)),
        );
      if (
        !order ||
        order.user_id !== item.user_id ||
        !isSignalDueSoon(order) ||
        Date.parse(order.reservation_expires_at) !== Date.parse(item.expires_at) ||
        !amount ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !preference?.enabled ||
        preference.email !== item.email ||
        !user?.email_confirmed_at ||
        user.email !== item.email ||
        hasActiveSignalDelivery(pushResult.data || [])
      ) {
        await finish(item, "skipped");
        results.skipped++;
        continue;
      }
      const payload = signalEmailPayload(item.order_id, item.expires_at, item.email);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": payload.key,
        },
        body: JSON.stringify({
          from,
          to: payload.to,
          subject: payload.subject,
          text: payload.text,
        }),
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        await finish(item, retryable ? "failed" : "skipped");
        if (retryable) results.failed++;
        else results.skipped++;
        break;
      }
      const result = (await response.json()) as { id?: string };
      if (!result.id) throw new Error("email_provider_invalid_response");
      await finish(item, "sent");
      results.sent++;
    } catch {
      await finish(item, "failed");
      results.failed++;
    }
  }
  return results;
}
