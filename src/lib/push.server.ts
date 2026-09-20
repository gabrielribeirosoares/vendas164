import webpush from "web-push";
import { supabaseAdmin } from "../integrations/supabase/client.server";

// Configure Web Push Keys
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY || "BDdwrBpz-nGKX2I5uZL4LpQ8oY57fdNSmqpiZyUTo9DnAxUsW2Pxp_2k7aPyXAAUksfWwYW60uIjH7BB7yUMnNs";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "K72Ai7yO_rdAJ0mtwwwHV9vzytuvukF8qKOLFrtJDNE";
const contactEmail = "mailto:contato@vendas164.com.br";

try {
  webpush.setVapidDetails(contactEmail, vapidPublicKey, vapidPrivateKey);
} catch (error) {
  console.error("Falha ao configurar VAPID details. Chaves não configuradas?", error);
}

export async function saveSubscriptionToDatabase(userId: string, data: { endpoint: string; p256dh: string; auth: string; user_agent?: string; store_id?: string }) {
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        store_id: data.store_id || null, // Optional store association
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.user_agent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    console.error("Failed to save push subscription:", error);
    throw new Error("Não foi possível salvar a inscrição de notificações.");
  }
}

export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  // Fetch subscriptions for this user
  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subscriptions || subscriptions.length === 0) {
    return; // User has no subscriptions, silently return
  }

  const pushPayload = JSON.stringify(payload);

  const promises = subscriptions.map(async (sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, pushPayload);
    } catch (pushError: any) {
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        // Subscription has expired or is no longer valid, delete it
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      } else {
        console.error("Error sending push notification:", pushError);
      }
    }
  });

  await Promise.allSettled(promises);
}

export async function notifySellerNewOrder(storeId: string) {
  const { data: store } = await supabaseAdmin.from("stores").select("owner_id").eq("id", storeId).maybeSingle();
  if (store && store.owner_id) {
    await sendPushNotification(store.owner_id, {
      title: "Novo Pedido/Reserva!",
      body: "Acesse seu painel de Vendedor para visualizar.",
      url: "/vendedor?tab=reservas",
    });
  }
}

export async function notifyCustomerOrderUpdate(customerId: string, status: string) {
  await sendPushNotification(customerId, {
    title: "Atualização no seu pedido",
    body: `O status do seu pedido mudou para: ${status}.`,
    url: "/painel",
  });
}
