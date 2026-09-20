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
