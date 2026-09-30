import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { gatewayAdmin, getMercadoPagoAccessToken, parseOrderIds, paymentAttemptKey, paymentAttemptReference, pendingAmount } from "@/lib/mercadoPago.server";

const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status });
type PaymentMethod = "pix" | "checkout_pro";
type Attempt = { id: string; response_payload: Record<string, unknown> | null; status: string };

export const Route = createFileRoute("/api/mercadopago/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let attemptId: string | null = null;
        try {
          const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
          if (!bearer) return errorResponse("Entre na sua conta para pagar.", 401);
          const admin = gatewayAdmin();
          const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
          if (authError || !user) return errorResponse("Sessão inválida.", 401);

          const body = await request.json();
          const storeId = String(body.storeId || "");
          if (!/^[0-9a-f-]{36}$/i.test(storeId)) return errorResponse("Loja inválida.", 400);
          const orderIds = parseOrderIds(body.orderIds);
          const method = body.paymentMethodId as PaymentMethod;
          if (method !== "pix" && method !== "checkout_pro") return errorResponse("Forma de pagamento inválida.", 400);

          const [{ data: orders, error: orderError }, { data: store, error: storeError }] = await Promise.all([
            admin.from("orders").select("id, store_id, user_id, total_price, down_payment, payment_status, installment_count, products(model, max_installments)").in("id", orderIds),
            admin.from("stores").select("id, name").eq("id", storeId).maybeSingle(),
          ]);
          if (orderError || storeError) throw orderError || storeError;
          if (!store || !orders || orders.length !== orderIds.length || orders.some((o) => o.store_id !== storeId || o.user_id !== user.id)) {
            return errorResponse("Pedidos não encontrados para sua conta nesta loja.", 403);
          }

          const amountCents = orders.reduce((sum, order) => sum + pendingAmount(order), 0);
          const amount = Number((amountCents / 100).toFixed(2));
          const maxInstallments = Math.max(1, Math.min(12, ...orders.map((order) => {
            const product = order.products as { model?: string; max_installments?: number } | null;
            return Number(order.installment_count || product?.max_installments || 1);
          })));
          const firstProduct = (orders[0]?.products as { model?: string } | null)?.model?.trim();
          const description = (firstProduct
            ? `${firstProduct}${orders.length > 1 ? ` (+${orders.length - 1} itens)` : ""} — ${store.name}`
            : `Pedido — ${store.name}`).slice(0, 128);

          let accessToken: string;
          try { accessToken = await getMercadoPagoAccessToken(storeId); }
          catch { return errorResponse("Esta loja ainda não conectou o Mercado Pago.", 400); }

          const now = new Date();
          await admin.from("gateway_payment_attempts" as never)
            .update({ status: "expired", updated_at: now.toISOString() } as never)
            .eq("user_id", user.id).eq("store_id", storeId).eq("provider", "mercadopago")
            .in("status", ["created", "pending"]).lte("expires_at", now.toISOString());

          const expiresAt = new Date(now.getTime() + (method === "pix" ? 30 : 120) * 60_000).toISOString();
          const requestKey = paymentAttemptKey(storeId, user.id, orderIds, amountCents, method);
          const { data: attemptIdFromRpc, error: attemptError } = await admin.rpc(
            "create_gateway_payment_attempt" as never,
            {
              p_attempt_id: randomUUID(),
              p_store_id: storeId,
              p_user_id: user.id,
              p_order_ids: orderIds,
              p_request_key: requestKey,
              p_amount: amount,
              p_payment_method: method,
              p_provider: "mercadopago",
              p_max_installments: maxInstallments,
              p_description: description,
              p_expires_at: expiresAt,
            } as never,
          );
          if (attemptError) {
            if (attemptError.message.includes("gateway_order_payment_in_progress")) {
              return errorResponse("Já existe uma cobrança em andamento para este pedido. Conclua ou aguarde a confirmação antes de iniciar outra.", 409);
            }
            throw attemptError;
          }
          const { data: attempt, error: loadAttemptError } = await admin
            .from("gateway_payment_attempts" as never)
            .select("id, response_payload, status")
            .eq("id", String(attemptIdFromRpc))
            .single();
          if (loadAttemptError || !attempt) throw loadAttemptError || new Error("Não foi possível recuperar a tentativa de pagamento.");
          const paymentAttempt = attempt as unknown as Attempt;
          attemptId = paymentAttempt.id;
          if (paymentAttempt.response_payload) return Response.json(paymentAttempt.response_payload);
          if (paymentAttempt.status === "pending") return errorResponse("A cobrança está sendo processada. Tente novamente em instantes.", 409);

          const externalReference = paymentAttemptReference(paymentAttempt.id);
          const notificationUrl = `https://vendas164.com.br/api/mercadopago/webhook?store_id=${encodeURIComponent(storeId)}`;
          const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "X-Idempotency-Key": paymentAttempt.id,
          };
          const response = method === "pix"
            ? await fetch("https://api.mercadopago.com/v1/orders", {
                method: "POST", headers,
                body: JSON.stringify({
                  type: "online", external_reference: externalReference, total_amount: amount.toFixed(2),
                  notification_url: notificationUrl, payer: { email: user.email },
                  transactions: { payments: [{ amount: amount.toFixed(2), payment_method: { id: "pix", type: "bank_transfer" } }] },
                }),
              })
            : await fetch("https://api.mercadopago.com/checkout/preferences", {
                method: "POST", headers,
                body: JSON.stringify({
                  items: [{ id: paymentAttempt.id, title: description, quantity: 1, unit_price: amount, currency_id: "BRL" }],
                  payer: { name: String(user.user_metadata?.name || "Cliente").slice(0, 100) },
                  payment_methods: { installments: maxInstallments },
                  back_urls: {
                    success: "https://vendas164.com.br/painel?status=approved",
                    pending: "https://vendas164.com.br/painel?status=pending",
                    failure: "https://vendas164.com.br/painel?status=failure",
                  },
                  auto_return: "approved", external_reference: externalReference,
                  notification_url: notificationUrl,
                  statement_descriptor: store.name.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 16) || "VENDAS164",
                }),
              });
          const result = await response.json();
          if (!response.ok) {
            await admin.from("gateway_payment_attempts" as never)
              .update({ status: "failed", updated_at: new Date().toISOString() } as never).eq("id", paymentAttempt.id);
            const safeText = (value: unknown) => typeof value === "string"
              ? value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email ocultado]")
                  .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[valor ocultado]")
                  .slice(0, 180)
              : undefined;
            const providerError = result as { error?: unknown; message?: unknown; cause?: unknown };
            const causes = Array.isArray(providerError.cause)
              ? providerError.cause.slice(0, 3).map((item) => {
                  const cause = item as { code?: unknown; description?: unknown };
                  return { code: safeText(String(cause.code ?? "")), description: safeText(cause.description) };
                })
              : undefined;
            console.error("Mercado Pago recusou criação de cobrança:", {
              status: response.status,
              error: safeText(providerError.error),
              message: safeText(providerError.message),
              causes,
              requestId: response.headers.get("x-request-id"),
            });
            return errorResponse("Não foi possível gerar a cobrança. Tente novamente.", 502);
          }

          let responsePayload: Record<string, unknown>;
          if (method === "pix") {
            const pix = result.transactions?.payments?.[0]?.payment_method;
            responsePayload = { id: result.id, status: result.status, paymentMethodId: "pix", transactionAmount: amount, pix: {
              qrCode: pix?.qr_code || "", qrCodeBase64: pix?.qr_code_base64 || "", ticketUrl: pix?.ticket_url || "",
            }, orderIds };
          } else {
            responsePayload = { preferenceId: result.id, initPoint: result.init_point, sandboxInitPoint: result.sandbox_init_point, orderIds };
          }
          const { error: updateError } = await admin.from("gateway_payment_attempts" as never).update({
            status: "pending", provider_resource_id: String(result.id), response_payload: responsePayload,
            updated_at: new Date().toISOString(),
          } as never).eq("id", paymentAttempt.id);
          if (updateError) throw updateError;
          return Response.json(responsePayload);
        } catch (error) {
          console.error("Erro ao iniciar pagamento:", error);
          if (attemptId) {
            try {
              await gatewayAdmin().from("gateway_payment_attempts" as never)
                .update({ status: "failed", updated_at: new Date().toISOString() } as never)
                .eq("id", attemptId).eq("status", "created");
            } catch { /* Preserve the original failure. */ }
          }
          return errorResponse("Não foi possível iniciar o pagamento.", 500);
        }
      },
    },
  },
});
