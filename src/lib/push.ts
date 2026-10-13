import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const savePushSubscriptionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { endpoint: string; p256dh: string; auth: string; user_agent?: string; store_id?: string }) => data)
  .handler(async ({ data, context }) => {
    return (await import("./push.server")).saveSubscriptionToDatabase(context.userId, data, context.supabase);
  });

export const notifySellerNewOrderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: {orderId:string}) => data)
  .handler(async ({data,context}) => (await import("./push.server")).notifyAuthorizedOrder(context.supabase,data.orderId,"new"));

export const notifyCustomerOrderUpdateServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: {orderId:string;field:"payment"|"delivery"}) => data)
  .handler(async ({data,context}) => (await import("./push.server")).notifyAuthorizedOrder(context.supabase,data.orderId,"update",data.field));

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
