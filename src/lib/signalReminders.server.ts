import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isSignalDueSoon, isAllowedPushEndpoint } from "./signalReminder";

type Reminder = {
  order_id: string;
  subscription_id: string;
  expires_at: string;
  claim_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  model: string;
  store_name: string;
  amount: number;
};
// New migration objects are server-only until generated database types are refreshed.
const db = supabaseAdmin as unknown as SupabaseClient;

export async function sendSignalExpiryReminders() {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("push_configuration_missing");
  webpush.setVapidDetails("mailto:contato@vendas164.com.br", publicKey, privateKey);
  const { data, error } = await db.rpc("claim_signal_reminders", { _limit: 20 });
  if (error) throw new Error("reminder_claim_failed");
  const reminders = (data || []) as Reminder[];
  const results = { claimed: reminders.length, sent: 0, skipped: 0, failed: 0 };
  const finish = async (item: Reminder, status: "sent" | "skipped" | "failed") => {
    const { error } = await db
      .from("signal_reminder_deliveries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("order_id", item.order_id)
      .eq("subscription_id", item.subscription_id)
      .eq("expires_at", item.expires_at)
      .eq("claim_id", item.claim_id);
    if (error) throw new Error("reminder_result_not_saved");
  };
  // Five devices at a time: bounded requests and timeouts keep the cron invocation short.
  for (let offset = 0; offset < reminders.length; offset += 5) {
    await Promise.all(
      reminders.slice(offset, offset + 5).map(async (item) => {
        try {
          // Do not trust a stale claim: payment, cancellation or a changed deadline cancels the send.
          const { data: order, error } = await db
            .from("orders")
            .select(
              "user_id, payment_status, delivery_status, reservation_expires_at, signal_amount, down_payment, total_price",
            )
            .eq("id", item.order_id)
            .maybeSingle();
          if (error) throw new Error("reminder_recheck_failed");
          if (
            !order ||
            order.user_id !== item.user_id ||
            !isSignalDueSoon(order) ||
            Date.parse(order.reservation_expires_at) !== Date.parse(item.expires_at)
          ) {
            await finish(item, "skipped");
            results.skipped++;
            return;
          }
          const { data: subscription, error: subscriptionError } = await db
            .from("push_subscriptions")
            .select("endpoint, p256dh, auth")
            .eq("id", item.subscription_id)
            .eq("user_id", item.user_id)
            .maybeSingle();
          if (subscriptionError) throw new Error("subscription_recheck_failed");
          const dueAmount = Math.min(
            Number(order.total_price),
            Math.max(Number(order.signal_amount || 0), Number(order.down_payment || 0)),
          );
          if (
            !subscription ||
            !isAllowedPushEndpoint(subscription.endpoint) ||
            !Number.isFinite(dueAmount) ||
            dueAmount <= 0
          ) {
            await finish(item, "skipped");
            results.skipped++;
            return;
          }
          const deadline = new Date(item.expires_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
          const amount = dueAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify({
              title: "Seu sinal está próximo do vencimento",
              body: `${item.store_name}: sinal de ${amount} para ${item.model} vence em ${deadline}. Acesse suas reservas para pagar.`,
              url: "/painel",
              tag: `signal-${item.order_id}-${Date.parse(item.expires_at)}`,
            }),
            {
              TTL: Math.min(
                900,
                Math.max(1, Math.floor((Date.parse(item.expires_at) - Date.now()) / 1000)),
              ),
              timeout: 5000,
            },
          );
          await finish(item, "sent");
          results.sent++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await finish(item, "skipped");
            const { error: deleteError } = await db
              .from("push_subscriptions")
              .delete()
              .eq("id", item.subscription_id);
            if (deleteError) throw new Error("expired_subscription_cleanup_failed");
            results.skipped++;
          } else {
            await finish(item, "failed");
            results.failed++;
          }
        }
      }),
    );
  }
  return results;
}
