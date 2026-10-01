import { createFileRoute } from "@tanstack/react-router";
import { verifyAndConfirmInfinitePay } from "@/lib/infinitePay.server";

export const Route = createFileRoute("/api/infinitepay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json() as {
            order_nsu?: string; transaction_nsu?: string; invoice_slug?: string; slug?: string;
          };
          await verifyAndConfirmInfinitePay(
            String(payload.order_nsu || ""),
            String(payload.transaction_nsu || ""),
            String(payload.invoice_slug || payload.slug || ""),
          );
          return Response.json({ success: true, message: null });
        } catch (error) {
          console.error("Webhook InfinitePay não validado:", error);
          return Response.json({ success: false, message: "Pagamento não verificado." }, { status: 400 });
        }
      },
    },
  },
});
