import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const body = await request.json().catch(() => ({}));

          // O Mercado Pago pode enviar o ID via query params ou body
          const paymentId = body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");

          if (!paymentId) {
            return new Response(JSON.stringify({ received: true, message: "No payment ID" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Inicializar Supabase
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return new Response("Configuração de servidor ausente", { status: 500 });
          }

          const supabase = createClient<Database>(supabaseUrl, supabaseKey);

          // Buscar detalhes do pagamento no Mercado Pago usando tokens das lojas cadastradas
          let mpRes: Response | null = null;

          const { data: conns } = await supabase
            .from("mercadopago_connections" as any)
            .select("access_token")
            .eq("is_active", true);

          if (conns) {
            for (const conn of conns as any[]) {
              if (conn.access_token) {
                const attempt = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                  headers: { Authorization: `Bearer ${conn.access_token}` },
                });
                if (attempt.ok) {
                  mpRes = attempt;
                  break;
                }
              }
            }
          }

          if (!mpRes || !mpRes.ok) {
            console.warn(`[MP Webhook] Pagamento ${paymentId} não pôde ser consultado no MP.`);
            return new Response(JSON.stringify({ received: true }), { status: 200 });
          }

          const paymentData = await mpRes.json();
          const { status, external_reference } = paymentData;

          // Se o pagamento foi aprovado e temos a referência do pedido
          if (status === "approved" && external_reference) {
            const orderIds = String(external_reference)
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean);

            if (orderIds.length > 0) {
              const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              if (serviceKey) {
                const adminClient = createClient<Database>(supabaseUrl, serviceKey);
                await adminClient
                  .from("orders")
                  .update({
                    payment_status: "quitado",
                    gateway_payment_id: String(paymentId),
                    gateway_status: "approved",
                  } as any)
                  .in("id", orderIds);
              } else {
                await supabase.rpc("confirm_gateway_payment" as any, {
                  p_order_ids: orderIds,
                  p_amount: paymentData.transaction_amount || null,
                  p_payment_method: paymentData.payment_method_id || "pix",
                  p_gateway_id: String(paymentId),
                });
              }

              console.log(`[MP Webhook] Pedidos [${orderIds.join(", ")}] atualizados para quitado com sucesso!`);
            }
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[MP Webhook Error]", err);
          return new Response(JSON.stringify({ received: true }), { status: 200 });
        }
      },
    },
  },
});
