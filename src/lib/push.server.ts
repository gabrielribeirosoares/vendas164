import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import webpush from "web-push";
import { supabaseAdmin } from "../integrations/supabase/client.server";

// Configure only from deployment secrets; never use committed fallback keys.
function configureWebPush() {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("push_not_configured");
  webpush.setVapidDetails("mailto:contato@vendas164.com.br", publicKey, privateKey);
}

export async function saveSubscriptionToDatabase(userId: string, data: { endpoint: string; p256dh: string; auth: string; user_agent?: string; store_id?: string }, client: SupabaseClient<Database>) {
  configureWebPush();
  const { error } = await client
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

  configureWebPush();
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

export async function notifyAuthorizedOrder(client: SupabaseClient<Database>, orderId:string, kind:"new"|"update", field?:"payment"|"delivery") {
  configureWebPush();
  const {data,error} = await client.rpc("claim_order_push",{_order_id:orderId,_kind:kind,_field:field});
  if(error) throw new Error("notification_access_denied");
  if(!data) return;
  const target=data as {recipient:string;status:string|null};
  await sendPushNotification(target.recipient,kind === "new" ? {
    title:"Novo Pedido/Reserva!",body:"Acesse seu painel de Vendedor para visualizar.",url:"/vendedor?tab=reservas"
  } : {title:"Atualização no seu pedido",body:`O status do seu pedido mudou para: ${target.status}.`,url:"/painel"});
}
