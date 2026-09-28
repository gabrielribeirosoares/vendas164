import { createFileRoute } from "@tanstack/react-router";
import { finishMercadoPagoConnection } from "@/lib/mercadoPago.server";

export const Route = createFileRoute("/api/mercadopago/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        try {
          await finishMercadoPagoConnection(request.url, origin);
          return Response.redirect(`${origin}/vendedor?tab=pagamentos&mercadopago=connected`, 302);
        } catch (error) {
          console.error("Erro no callback OAuth do Mercado Pago:", error);
          const reason = error instanceof Error ? error.message : "Não foi possível concluir a conexão.";
          return Response.redirect(`${origin}/vendedor?tab=pagamentos&mercadopago=error&reason=${encodeURIComponent(reason)}`, 302);
        }
      },
    },
  },
});
