import { createFileRoute } from "@tanstack/react-router";
import { gatewayAdmin, parseOrderIds, pendingAmount, paymentRequestKey } from "@/lib/mercadoPago.server";

const errorResponse = (message: string, status: number) =>
  Response.json({ error: message }, { status });

export const Route = createFileRoute("/api/mercadopago/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
          const method = body.paymentMethodId;
          if (method !== "pix" && method !== "checkout_pro") return errorResponse("Forma de pagamento inválida.", 400);

          const { data: orders, error: orderError } = await admin
            .from("orders")
            .select("id, store_id, user_id, total_price, down_payment, payment_status")
            .in("id", orderIds);
          if (orderError) throw orderError;
          if (!orders || orders.length !== orderIds.length || orders.some((o) => o.store_id !== storeId || o.user_id !== user.id)) {
            return errorResponse("Pedidos não encontrados para sua conta nesta loja.", 403);
          }
          const amountCents = orders.reduce((sum, order) => sum + pendingAmount(order), 0);
          const amount = (amountCents / 100).toFixed(2);

          const { data: connection, error: connectionError } = await admin
            .from("mercadopago_connections" as never)
            .select("access_token, is_active, is_sandbox")
            .eq("store_id", storeId)
            .maybeSingle();
          if (connectionError) throw connectionError;
          const credentials = connection as { access_token?: string; is_active?: boolean; is_sandbox?: boolean } | null;
          if (!credentials?.is_active || !credentials.access_token) {
            return errorResponse("Esta loja ainda não configurou o Mercado Pago.", 400);
          }

          const externalRef = orderIds.join(",");
          const notificationUrl = `https://vendas164.com.br/api/mercadopago/webhook?store_id=${encodeURIComponent(storeId)}`;
          const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${credentials.access_token}`,
            "X-Idempotency-Key": paymentRequestKey(storeId, orderIds, amountCents, method),
          };
          const response = method === "pix"
            ? await fetch("https://api.mercadopago.com/v1/orders", {
                method: "POST", headers,
                body: JSON.stringify({
                  type: "online", external_reference: externalRef, total_amount: amount,
                  notification_url: notificationUrl,
                  payer: { email: user.email },
                  transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" } }] },
                }),
              })
            : await fetch("https://api.mercadopago.com/checkout/preferences", {
                method: "POST", headers,
                body: JSON.stringify({
                  items: [{ id: externalRef, title: `Pedido na loja ${storeId.slice(0, 8)}`, quantity: 1, unit_price: Number(amount), currency_id: "BRL" }],
                  payer: { name: String(body.payer?.name || user.user_metadata?.name || "Cliente").slice(0, 100) },
                  back_urls: {
                    success: "https://vendas164.com.br/painel?status=approved",
                    pending: "https://vendas164.com.br/painel?status=pending",
                    failure: "https://vendas164.com.br/painel?status=failure",
                  },
                  auto_return: "approved", external_reference: externalRef,
                  notification_url: notificationUrl,
                }),
              });
          const result = await response.json();
          if (!response.ok) {
            console.error("Mercado Pago recusou criação de cobrança:", response.status);
            return errorResponse("Não foi possível gerar a cobrança. Tente novamente.", 502);
          }
          if (method === "pix") {
            const pix = result.transactions?.payments?.[0]?.payment_method;
            return Response.json({ id: result.id, status: result.status, paymentMethodId: "pix", transactionAmount: Number(amount), pix: {
              qrCode: pix?.qr_code || "", qrCodeBase64: pix?.qr_code_base64 || "", ticketUrl: pix?.ticket_url || "",
            }, orderIds });
          }
          return Response.json({ preferenceId: result.id, initPoint: result.init_point, sandboxInitPoint: result.sandbox_init_point, orderIds });
        } catch (error) {
          console.error("Erro ao iniciar pagamento:", error);
          return errorResponse("Não foi possível iniciar o pagamento.", 500);
        }
      },
    },
  },
});
