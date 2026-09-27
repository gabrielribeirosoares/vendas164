import { createFileRoute } from "@tanstack/react-router";
import { gatewayAdmin, parseOrderIds, paymentAttemptKey, paymentAttemptReference, pendingAmount } from "@/lib/mercadoPago.server";

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
            admin.from("orders").select("id, store_id, user_id, total_price, down_payment, payment_status, installment_count, products(name, max_installments)").in("id", orderIds),
            admin.from("stores").select("id, name").eq("id", storeId).maybeSingle(),
          ]);
          if (orderError || storeError) throw orderError || storeError;
          if (!store || !orders || orders.length !== orderIds.length || orders.some((o) => o.store_id !== storeId || o.user_id !== user.id)) {
            return errorResponse("Pedidos não encontrados para sua conta nesta loja.", 403);
          }

          const amountCents = orders.reduce((sum, order) => sum + pendingAmount(order), 0);
          const amount = Number((amountCents / 100).toFixed(2));
          const maxInstallments = Math.max(1, Math.min(12, ...orders.map((order) => {
            const product = order.products as { name?: string; max_installments?: number } | null;
            return Number(order.installment_count || product?.max_installments || 1);
          })));
          const firstProduct = (orders[0]?.products as { name?: string } | null)?.name?.trim();
          const description = (firstProduct
            ? `${firstProduct}${orders.length > 1 ? ` (+${orders.length - 1} itens)` : ""} — ${store.name}`
            : `Pedido — ${store.name}`).slice(0, 128);

          const { data: connection, error: connectionError } = await admin
            .from("mercadopago_connections" as never)
            .select("access_token, is_active, is_sandbox").eq("store_id", storeId).maybeSingle();
          if (connectionError) throw connectionError;
          const credentials = connection as { access_token?: string; is_active?: boolean; is_sandbox?: boolean } | null;
          if (!credentials?.is_active || !credentials.access_token) return errorResponse("Esta loja ainda não configurou o Mercado Pago.", 400);

          const now = new Date();
          await admin.from("gateway_payment_attempts" as never)
            .update({ status: "expired", updated_at: now.toISOString() } as never)
            .eq("user_id", user.id).eq("store_id", storeId)
            .in("status", ["created", "pending"]).lte("expires_at", now.toISOString());

          const expiresAt = new Date(now.getTime() + (method === "pix" ? 30 : 120) * 60_000).toISOString();
          const requestKey = paymentAttemptKey(storeId, user.id, orderIds, amountCents, method);
          const attemptInput = {
            store_id: storeId, user_id: user.id, order_ids: orderIds, amount,
            request_key: requestKey,
            payment_method: method, max_installments: maxInstallments,
            description, expires_at: expiresAt,
          };
          let { data: attempt, error: attemptError } = await admin
            .from("gateway_payment_attempts" as never).insert(attemptInput as never)
            .select("id, response_payload, status").single();

          if (attemptError?.code === "23505") {
            const existing = await admin.from("gateway_payment_attempts" as never)
              .select("id, response_payload, status")
              .eq("store_id", storeId).eq("user_id", user.id).eq("request_key", requestKey)
              .in("status", ["created", "pending"]).maybeSingle();
            if (existing.error) throw existing.error;
            attempt = existing.data;
            attemptError = null;
          }
          if (attemptError || !attempt) throw attemptError || new Error("Não foi possível registrar a tentativa.");
          const paymentAttempt = attempt as unknown as Attempt;
          attemptId = paymentAttempt.id;
          if (paymentAttempt.response_payload) return Response.json(paymentAttempt.response_payload);
          if (paymentAttempt.status === "pending") return errorResponse("A cobrança está sendo processada. Tente novamente em instantes.", 409);

          const externalReference = paymentAttemptReference(paymentAttempt.id);
          const notificationUrl = `https://vendas164.com.br/api/mercadopago/webhook?store_id=${encodeURIComponent(storeId)}`;
          const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${credentials.access_token}`,
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
            console.error("Mercado Pago recusou criação de cobrança:", response.status);
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
