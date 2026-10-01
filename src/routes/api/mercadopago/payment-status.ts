import { createFileRoute } from "@tanstack/react-router";
import { gatewayAdmin } from "@/lib/mercadoPago.server";

export const Route = createFileRoute("/api/mercadopago/payment-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
        const attemptId = new URL(request.url).searchParams.get("attemptId") || "";
        if (!bearer || !/^[0-9a-f-]{36}$/i.test(attemptId)) {
          return Response.json({ error: "Solicitação inválida." }, { status: 400 });
        }

        try {
          const admin = gatewayAdmin();
          const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
          if (authError || !user) return Response.json({ error: "Sessão inválida." }, { status: 401 });

          const { data, error } = await admin
            .from("gateway_payment_attempts" as never)
            .select("id, status, amount, order_ids, completed_at")
            .eq("id", attemptId)
            .eq("user_id", user.id)
            .eq("provider", "mercadopago")
            .maybeSingle();
          if (error) throw error;
          if (!data) return Response.json({ error: "Tentativa de pagamento não encontrada." }, { status: 404 });

          const attempt = data as unknown as {
            id: string;
            status: "created" | "pending" | "approved" | "failed" | "expired";
            amount: number;
            order_ids: string[];
            completed_at: string | null;
          };
          return Response.json({
            status: attempt.status,
            amount: Number(attempt.amount),
            orderIds: attempt.order_ids,
            completedAt: attempt.completed_at,
          });
        } catch (error) {
          console.error("Erro ao consultar status de pagamento Mercado Pago:", error);
          return Response.json({ error: "Não foi possível consultar o status do pagamento." }, { status: 500 });
        }
      },
    },
  },
});
