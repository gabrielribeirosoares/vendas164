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

export const checkPushSubscriptionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { endpoint: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: subscription, error } = await context.supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("push_subscription_check_failed");
    return !!subscription;
  });

export const removePushSubscriptionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { endpoint: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: removed, error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId)
      .select("id");
    if (error || !removed?.length) throw new Error("push_subscription_removal_failed");
  });
