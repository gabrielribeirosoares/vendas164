import { createFileRoute } from "@tanstack/react-router";
import { infinitePayAdmin } from "@/lib/infinitePay.server";

export const Route = createFileRoute("/api/infinitepay/public-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const storeId = new URL(request.url).searchParams.get("storeId") || "";
        if (!/^[0-9a-f-]{36}$/i.test(storeId)) return Response.json({ enabled: false });
        try {
          const { data, error } = await infinitePayAdmin().from("infinitepay_connections" as never)
            .select("is_active").eq("store_id", storeId).maybeSingle();
          if (error) throw error;
          return Response.json({ enabled: Boolean((data as unknown as { is_active?: boolean } | null)?.is_active) });
        } catch {
          return Response.json({ enabled: false }, { status: 200 });
        }
      },
    },
  },
});
