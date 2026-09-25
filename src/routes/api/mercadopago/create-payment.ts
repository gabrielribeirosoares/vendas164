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



export const Route = createFileRoute("/api/mercadopago/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const {
            storeId,
            storeName,
            orderIds,
            amount: requestedAmount,
            paymentMethodId = "pix",
            token,
            installments = 1,
            payer = {},
          } = body;

          if (!storeId) {
            return jsonError("ID da loja é obrigatório.", 400);
          }

          if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return jsonError("Pelo menos um pedido deve ser informado.", 400);
          }

          // Criar cliente Supabase com service_role ou anon key + auth header da sessão
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const supabaseKey = serviceKey || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return jsonError("Configuração do servidor incompleta.", 500);
          }

          const authHeader = request.headers.get("authorization");
          const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
            global: {
              headers: authHeader ? { Authorization: authHeader } : {},
            },
          });

          // Cliente admin (service_role) para acessar mercadopago_connections sem RLS
          const adminClient = serviceKey
            ? createClient<Database>(supabaseUrl, serviceKey)
            : supabase;

          // 1. Obter credencial do Mercado Pago para a loja (usa admin para bypassar RLS)
          const { data: connection } = await adminClient
            .from("mercadopago_connections" as any)
            .select("access_token, is_sandbox, is_active")
            .eq("store_id", storeId)
            .maybeSingle();

          if (!connection || !(connection as any).is_active || !(connection as any).access_token) {
            return jsonError(
              "Esta loja ainda não conectou uma conta do Mercado Pago para pagamentos automáticos. O lojista precisa configurar suas credenciais na aba Pagamentos.",
              400
            );
          }

          const accessToken = (connection as any).access_token;

          // 2. Buscar pedidos no banco de dados para validar valor
          const { data: orders } = await supabase
            .from("orders")
            .select("id, total_price, down_payment, payment_status, product_id, store_id, installment_count, products(name, max_installments)")
            .in("id", orderIds);

          // Calcular valor total pendente caso os pedidos sejam retornados
          let calculatedTotal = 0;
          if (orders && orders.length > 0) {
            for (const ord of orders) {
              const total = Number(ord.total_price || 0);
              const signal = Number(ord.down_payment || 0);

              if (ord.payment_status === "aguardando_sinal") {
                calculatedTotal += signal > 0 ? signal : total;
              } else if (ord.payment_status === "sinal_pago") {
                calculatedTotal += Math.max(0, total - signal);
              } else if (ord.payment_status === "pendente") {
                calculatedTotal += total;
              } else {
                calculatedTotal += total;
              }
            }
          }

          // Usar valor calculado do banco ou requestedAmount enviado pelo checkout
          const finalAmount = calculatedTotal > 0
            ? Number(calculatedTotal.toFixed(2))
            : (requestedAmount && requestedAmount > 0 ? Number(Number(requestedAmount).toFixed(2)) : 0);

          if (finalAmount <= 0) {
            return jsonError("O valor total da cobrança deve ser maior que zero.", 400);
          }

          // 3. Montar payload do Mercado Pago
          const externalRef = orderIds.join(",");
          const cleanEmail = payer.email && payer.email.includes("@") 
            ? payer.email 
            : "cliente@vendas164.com.br";

          // 4. Se for PIX, usar a nova API oficial de Orders do Mercado Pago
          if (paymentMethodId === "pix") {
            const orderPayload = {
              type: "online",
              external_reference: externalRef,
              total_amount: finalAmount.toFixed(2),
              payer: {
                email: cleanEmail,
              },
              transactions: {
                payments: [
                  {
                    amount: finalAmount.toFixed(2),
                    payment_method: {
                      id: "pix",
                      type: "bank_transfer",
                    },
                  },
                ],
              },
            };

            const mpResponse = await fetch("https://api.mercadopago.com/v1/orders", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                "X-Idempotency-Key": `v164-pix-${orderIds.slice(0, 3).join("-")}-${Date.now()}`,
              },
              body: JSON.stringify(orderPayload),
            });

            const mpData = await mpResponse.json();

            if (!mpResponse.ok) {
              console.error("[MercadoPago Orders Error]", mpData);
              const errDetail = mpData.message || mpData.errors?.[0]?.message || "Erro ao gerar PIX.";
              return jsonError(`Mercado Pago: ${errDetail}`, mpResponse.status);
            }

            const paymentItem = mpData.transactions?.payments?.[0];
            const pixInfo = paymentItem?.payment_method;

            return jsonResponse({
              id: mpData.id,
              status: mpData.status,
              statusDetail: mpData.status_detail,
              paymentMethodId: "pix",
              transactionAmount: finalAmount,
              pix: {
                qrCode: pixInfo?.qr_code || "",
                qrCodeBase64: pixInfo?.qr_code_base64 || "",
                ticketUrl: pixInfo?.ticket_url || "",
              },
              orderIds,
            });
          }

          // 5. Se for Checkout Pro / Pagamento com Cartão no layout oficial do Mercado Pago
          if (paymentMethodId === "checkout_pro" || !token) {
            const reqOrigin = body?.origin || request.headers.get("origin") || request.headers.get("referer") || "https://vendas164.com.br";
            let baseOrigin = "https://vendas164.com.br";
            try {
              baseOrigin = new URL(reqOrigin).origin;
            } catch {
              baseOrigin = "https://vendas164.com.br";
            }

            const cleanStoreName = String(storeName || "Loja").trim();
            const firstModel = (orders && (orders[0] as any)?.products?.name) ? (orders[0] as any).products.name : "";
            const itemTitle = firstModel
              ? `${firstModel}${orders && orders.length > 1 ? ` (+${orders.length - 1} itens)` : ""}`
              : `Pedido na ${cleanStoreName}`;

            const isHttps = baseOrigin.startsWith("https://");

            const prefPayload: any = {
              items: [
                {
                  id: externalRef,
                  title: itemTitle.slice(0, 128),
                  quantity: 1,
                  unit_price: Number(finalAmount.toFixed(2)),
                  currency_id: "BRL",
                },
              ],
              payer: {
                name: payer?.name || payer?.firstName || "Cliente",
                // Removido o envio do e-mail no backend porque no Sandbox do Checkout Pro 
                // o MP exige que o e-mail pertença a um 'Test User' oficial gerado via API.
                // Se enviarmos um e-mail aleatório ou o e-mail real do vendedor, a página quebra (422/Ops ocorreu um erro).
                // Ao não enviar, o próprio Mercado Pago vai pedir o e-mail na tela de checkout.
              },

              back_urls: {
                success: `${baseOrigin}/painel?status=approved&collection_status=approved&orderIds=${externalRef}`,
                pending: `${baseOrigin}/painel?status=pending&collection_status=pending&orderIds=${externalRef}`,
                failure: `${baseOrigin}/painel?status=failure&collection_status=failure&orderIds=${externalRef}`,
              },
              ...(isHttps ? { auto_return: "approved" } : {}),
              external_reference: externalRef,
              statement_descriptor: cleanStoreName.slice(0, 16),
            };

            if (baseOrigin.includes("http") && !baseOrigin.includes("localhost") && !baseOrigin.includes("127.0.0.1")) {
              prefPayload.notification_url = `${baseOrigin}/api/mercadopago/webhook`;
            }

            const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify(prefPayload),
            });

            const mpData = await mpResponse.json();

            if (!mpResponse.ok) {
              console.error("[MercadoPago Preferences Error]", mpData);
              const errDetail = mpData.message || mpData.errors?.[0]?.message || "Erro ao criar preferência de checkout.";
              return jsonError(`Mercado Pago: ${errDetail}`, mpResponse.status);
            }

            return jsonResponse({
              preferenceId: mpData.id,
              initPoint: mpData.init_point,
              sandboxInitPoint: mpData.sandbox_init_point,
              orderIds,
            });
          }

          let brandId = (paymentMethodId || "visa").toLowerCase();
          if (brandId === "credit_card" || brandId === "card") {
            brandId = "visa";
          }

          // Validação e trava das parcelas:
          // 1. Respeita o limite selecionado no carrinho ou configurado no produto
          // 2. Respeita a regra do Mercado Pago de valor mínimo por parcela (R$ 5,00 no Brasil)
          const cartMaxInstallments = orders && orders.length > 0
            ? Math.min(...orders.map((o: any) => Number(o.installment_count || o.products?.max_installments || 1)))
            : 12;
          const mpMaxInstallments = Math.max(1, Math.floor(finalAmount / 5.00));
          const effectiveMax = Math.max(1, Math.min(cartMaxInstallments, mpMaxInstallments));
          const safeInstallments = Math.max(1, Math.min(Number(installments) || 1, effectiveMax));

          const cardPaymentPayload = {
            transaction_amount: Number(finalAmount.toFixed(2)),
            token,
            description: `Pedido ${orderIds.join(", ")}`,
            installments: safeInstallments,
            payment_method_id: brandId,
            payer: {
              email: cleanEmail,
              first_name: payer?.firstName || "Cliente",
              last_name: payer?.lastName || "Vendas164",
              identification: payer?.identification,
            },
            external_reference: externalRef,
          };

          const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              "X-Idempotency-Key": `v164-card-${orderIds.slice(0, 3).join("-")}-${Date.now()}`,
            },
            body: JSON.stringify(cardPaymentPayload),
          });

          const mpData = await mpResponse.json();

          if (!mpResponse.ok) {
            console.error("[MercadoPago Payments Card Error]", mpData);
            let errDetail = mpData.message || mpData.cause?.[0]?.description || mpData.errors?.[0]?.message || "Erro ao processar cartão.";
            if (errDetail.includes("Unauthorized use of live credentials")) {
              errDetail = "A loja está usando credenciais de PRODUÇÃO (APP_USR-). O Mercado Pago não aceita cartões de teste em credenciais de produção. Use credenciais de teste (TEST-) no painel da loja ou utilize o botão 'Simular Pagamento' em modo teste.";
            }
            return jsonError(`Mercado Pago: ${errDetail}`, mpResponse.status);
          }

          const isApproved = mpData.status === "approved";

          // Se o pagamento já foi aprovado, dar baixa no pedido e nas parcelas
          if (isApproved) {
            console.log(`[CreatePayment] Pagamento ${mpData.id} aprovado. Dando baixa nos pedidos:`, orderIds);

            // 1. Tentar chamar RPC com SECURITY DEFINER (funciona com token do cliente)
            const { data: rpcData, error: rpcError } = await supabase.rpc(
              "confirm_gateway_payment" as any,
              {
                p_order_ids: orderIds,
                p_amount: finalAmount,
                p_payment_method: brandId,
                p_gateway_id: String(mpData.id),
              }
            );

            if (rpcError) {
              console.warn("[CreatePayment] RPC confirm_gateway_payment indisponível ou erro:", rpcError.message);
            } else {
              console.log("[CreatePayment] RPC confirm_gateway_payment sucesso:", rpcData);
            }

            // 2. Se houver SUPABASE_SERVICE_ROLE_KEY no ambiente, usar cliente admin para garantir a baixa precisa
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
                  if (finalAmount < total) {
                    newStatus = "sinal_pago";
                    newDownPayment = finalAmount;
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
                    payment_method: brandId,
                    gateway_payment_id: String(mpData.id),
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
              console.log("[CreatePayment] Pedidos e parcelas atualizados com sucesso!");
            }
          }

          return jsonResponse({
            id: mpData.id,
            status: isApproved ? "approved" : mpData.status,
            statusDetail: mpData.status_detail,
            paymentMethodId: brandId,
            transactionAmount: finalAmount,
            pix: null,
            orderIds,
          });
        } catch (error: any) {
          console.error("[Create Payment Error]", error);
          return jsonError(error?.message || "Erro interno ao processar pagamento.", 500);
        }
      },
    },
  },
});
