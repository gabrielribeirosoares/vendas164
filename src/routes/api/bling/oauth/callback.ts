import { createFileRoute } from "@tanstack/react-router";
import { finishConnection } from "@/lib/bling.server";

export const Route = createFileRoute("/api/bling/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        try {
          await finishConnection(request.url);
          return Response.redirect(`${origin}/vendedor?tab=produtos&bling=connected`, 302);
        } catch (error) {
          console.error("Erro no callback OAuth do Bling:", error);
          const reason = error instanceof Error ? error.message : "Não foi possível concluir a conexão.";
          return Response.redirect(`${origin}/vendedor?tab=produtos&bling=error&reason=${encodeURIComponent(reason)}`, 302);
        }
      },
    },
  },
});
