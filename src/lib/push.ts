import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const savePushSubscriptionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { endpoint: string; p256dh: string; auth: string; user_agent?: string; store_id?: string }) => data)
  .handler(async ({ data, context }) => {
    return (await import("./push.server")).saveSubscriptionToDatabase(context.userId, data);
  });

export const notifySellerNewOrderServer = createServerFn({ method: "POST" })
  .validator((storeId: string) => storeId)
  .handler(async ({ data: storeId }) => {
    return (await import("./push.server")).notifySellerNewOrder(storeId);
  });

export const notifyCustomerOrderUpdateServer = createServerFn({ method: "POST" })
  .validator((d: { customerId: string; status: string }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    return (await import("./push.server")).notifyCustomerOrderUpdate(data.customerId, data.status);
  });

// Temporary: test function to send a push notification to yourself
export const testPushNotificationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const pushServer = await import("./push.server");
    
    // Check how many subscriptions exist for this user
    const { supabaseAdmin } = await import("../integrations/supabase/client.server");
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, user_id")
      .eq("user_id", context.userId);
    
    console.log("[TEST PUSH] User ID:", context.userId);
    console.log("[TEST PUSH] Subscriptions found:", subs?.length ?? 0);
    console.log("[TEST PUSH] DB error:", error);
    if (subs) {
      subs.forEach((s, i) => console.log(`[TEST PUSH] Sub ${i}:`, s.endpoint?.substring(0, 60)));
    }
    
    await pushServer.sendPushNotification(context.userId, {
      title: "🔔 Teste de Notificação!",
      body: "Se você está vendo isso, as notificações push estão funcionando perfeitamente!",
      url: "/vendedor",
    });
    
    return {
      userId: context.userId,
      subscriptionsFound: subs?.length ?? 0,
      dbError: error?.message ?? null,
    };
  });
