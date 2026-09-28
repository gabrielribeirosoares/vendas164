import { createFileRoute } from "@tanstack/react-router";
import { assertStoreManager, getMercadoPagoConnectionStatus } from "@/lib/mercadoPago.server";

export const Route = createFileRoute("/api/mercadopago/oauth/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
          const storeId = new URL(request.url).searchParams.get("storeId") || "";
          if (!token || !/^[0-9a-f-]{36}$/i.test(storeId)) return Response.json({ error: "Solicitação inválida." }, { status: 400 });
          await assertStoreManager(token, storeId);
          return Response.json(await getMercadoPagoConnectionStatus(storeId));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível consultar a conexão.";
          return Response.json({ error: message }, { status: message.includes("permissão") ? 403 : 500 });
        }
      },
    },
  },
});
