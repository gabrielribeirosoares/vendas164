import { createFileRoute } from "@tanstack/react-router";
import { appBaseUrl, verifyAndConfirmInfinitePay } from "@/lib/infinitePay.server";

export const Route = createFileRoute("/api/infinitepay/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orderNsu = url.searchParams.get("order_nsu") || "";
        const transactionNsu = url.searchParams.get("transaction_nsu") || "";
        const slug = url.searchParams.get("slug") || "";
        try {
          await verifyAndConfirmInfinitePay(orderNsu, transactionNsu, slug);
          return Response.redirect(`${appBaseUrl()}/painel?infinitepay=confirmed`, 302);
        } catch (error) {
          console.error("Retorno InfinitePay não validado:", error);
          return Response.redirect(`${appBaseUrl()}/painel?infinitepay=pending`, 302);
        }
      },
    },
  },
});
