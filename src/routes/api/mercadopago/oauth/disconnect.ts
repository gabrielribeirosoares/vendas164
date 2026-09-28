import { createFileRoute } from "@tanstack/react-router";
import { assertStoreManager, disconnectMercadoPago } from "@/lib/mercadoPago.server";

export const Route = createFileRoute("/api/mercadopago/oauth/disconnect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
          const body = await request.json();
          const storeId = String(body.storeId || "");
          if (!token || !/^[0-9a-f-]{36}$/i.test(storeId)) return Response.json({ error: "Solicitação inválida." }, { status: 400 });
          await assertStoreManager(token, storeId);
          await disconnectMercadoPago(storeId);
          return Response.json({ disconnected: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Não foi possível desconectar a conta.";
          return Response.json({ error: message }, { status: message.includes("permissão") ? 403 : 500 });
        }
      },
    },
  },
});
