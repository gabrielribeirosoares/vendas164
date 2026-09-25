import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/mercadopago/simulate-approval")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { orderIds, amount, paymentId = "simulated_pix" } = body;

          if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return jsonError("Nenhum pedido informado.", 400);
          }

          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl) {
            return jsonError("Configuração do Supabase ausente.", 500);
          }

          // 1. Se houver service_role key, dar baixa direta com verificação inteligente de sinal
          if (serviceKey) {
            const adminClient = createClient<Database>(supabaseUrl, serviceKey);
            const { data: orderRows } = await adminClient
              .from("orders")
              .select("id, total_price, down_payment, payment_status")
              .in("id", orderIds);

            for (const ord of (orderRows || []) as any[]) {
              const total = Number(ord.total_price || 0);
              const signal = Number(ord.down_payment || 0);
              const isAguardando = ord.payment_status === "aguardando_sinal";

              let newStatus = "quitado";
              let newDownPayment = total;

              if (isAguardando) {
                // Se pagou menos que o total do pedido, é pagamento de sinal!
                if (amount && amount < total) {
                  newStatus = "sinal_pago";
                  newDownPayment = amount;
                } else if (signal > 0 && signal < total) {
                  newStatus = "sinal_pago";
                  newDownPayment = signal;
                } else {
                  newStatus = "quitado";
                  newDownPayment = total;
                }
              } else if (ord.payment_status === "sinal_pago") {
                // Se já tinha sinal pago e pagou o saldo restante
                newStatus = "quitado";
                newDownPayment = total;
              }

              await adminClient
                .from("orders")
                .update({
                  payment_status: newStatus,
                  down_payment: newDownPayment,
                  payment_method: "pix_sandbox",
                  gateway_payment_id: String(paymentId),
                  gateway_status: "approved",
                } as any)
                .eq("id", ord.id);

              // Atualizar parcelas se quitado
              if (newStatus === "quitado") {
                const nowIso = new Date().toISOString();
                const { data: existingInsts } = await adminClient
                  .from("order_installments")
                  .select("id, status")
                  .eq("order_id", ord.id);

                const pendingInsts = (existingInsts || []).filter((i: any) => i.status === "pending");
                if (pendingInsts.length > 0) {
                  await adminClient
                    .from("order_installments")
                    .update({ status: "paid", paid_at: nowIso })
                    .in("id", pendingInsts.map((i: any) => i.id));
                } else if (!existingInsts || existingInsts.length === 0) {
                  const count = Math.max(1, ord.installment_count || 1);
                  const balance = Math.max(0, total - (signal || 0));
                  const amountPer = count > 1 && balance > 0 ? balance / count : (balance > 0 ? balance : total);
                  const now = new Date();
                  const newRows = Array.from({ length: count }).map((_, i) => ({
                    order_id: ord.id,
                    installment_number: i + 1,
                    amount: Number(amountPer.toFixed(2)),
                    due_date: new Date(now.getFullYear(), now.getMonth() + i + 1, 10).toISOString(),
                    status: "paid",
                    paid_at: nowIso,
                  }));
                  await adminClient.from("order_installments").insert(newRows);
                }
              }
            }

            return jsonResponse({ success: true, message: "Baixa realizada com sucesso." });
          }

          // 2. Tentar via RPC confirm_gateway_payment
          const authHeader = request.headers.get("authorization");
          const client = createClient<Database>(supabaseUrl, publishableKey || "", {
            global: { headers: authHeader ? { Authorization: authHeader } : {} },
          });

          const { data: rpcData, error: rpcErr } = await client.rpc("confirm_gateway_payment" as any, {
            p_order_ids: orderIds,
            p_amount: amount || null,
            p_payment_method: "pix_sandbox",
            p_gateway_id: String(paymentId),
          });

          if (!rpcErr) {
            return jsonResponse({ success: true, rpcData });
          }

          // 3. Fallback de update direto
          const { error: updErr } = await client
            .from("orders")
            .update({
              payment_status: "quitado",
            } as any)
            .in("id", orderIds);

          if (!updErr) {
            return jsonResponse({ success: true, fallback: true });
          }

          return jsonError("Para dar baixa automática, configure a SUPABASE_SERVICE_ROLE_KEY no .env ou execute o script SQL mercadopago_completo.sql no Supabase.", 403);
        } catch (err: any) {
          return jsonError(err?.message || "Erro ao simular aprovação.", 500);
        }
      },
    },
  },
});
