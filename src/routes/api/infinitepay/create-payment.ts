import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { appBaseUrl, infinitePayAdmin } from "@/lib/infinitePay.server";
import { parseOrderIds, paymentAttemptKey, pendingAmount } from "@/lib/mercadoPago.server";

const fail = (error: string, status: number) => Response.json({ error }, { status });
type Attempt = { id: string; response_payload: Record<string, unknown> | null; status: string };

export const Route = createFileRoute("/api/infinitepay/create-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let attemptId: string | null = null;
        try {
          const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
          if (!bearer) return fail("Entre na sua conta para pagar.", 401);
          const admin = infinitePayAdmin();
          const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
          if (authError || !user) return fail("Sessão inválida.", 401);

          const body = await request.json();
          const storeId = String(body.storeId || "");
          if (!/^[0-9a-f-]{36}$/i.test(storeId)) return fail("Loja inválida.", 400);
          const orderIds = parseOrderIds(body.orderIds);

          const [{ data: orders, error: orderError }, { data: store, error: storeError }, { data: rawConnection, error: connectionError }] = await Promise.all([
            admin.from("orders").select("id, store_id, user_id, total_price, down_payment, payment_status, products(model)").in("id", orderIds),
            admin.from("stores").select("id, name").eq("id", storeId).maybeSingle(),
            admin.from("infinitepay_connections" as never).select("handle, is_active").eq("store_id", storeId).maybeSingle(),
          ]);
          if (orderError || storeError || connectionError) throw orderError || storeError || connectionError;
          const connection = rawConnection as unknown as { handle: string; is_active: boolean } | null;
          if (!connection?.is_active) return fail("Esta loja ainda não conectou a InfinitePay.", 400);
          if (!store || !orders || orders.length !== orderIds.length || orders.some((order) => order.store_id !== storeId || order.user_id !== user.id)) {
            return fail("Pedidos não encontrados para sua conta nesta loja.", 403);
          }

          const amountCents = orders.reduce((sum, order) => sum + pendingAmount(order), 0);
          const amount = Number((amountCents / 100).toFixed(2));
          const firstProduct = (orders[0]?.products as { model?: string } | null)?.model?.trim();
          const description = (firstProduct
            ? `${firstProduct}${orders.length > 1 ? ` (+${orders.length - 1} itens)` : ""} — ${store.name}`
            : `Pedido — ${store.name}`).slice(0, 120);

          const origin = appBaseUrl();
          const now = new Date();
          const requestKey = paymentAttemptKey(storeId, user.id, orderIds, amountCents, "infinitepay");
          const { data: attemptIdFromRpc, error: reserveError } = await admin.rpc(
            "create_gateway_payment_attempt" as never,
            {
              p_attempt_id: randomUUID(),
              p_store_id: storeId,
              p_user_id: user.id,
              p_order_ids: orderIds,
              p_request_key: requestKey,
              p_amount: amount,
              p_payment_method: "infinitepay",
              p_provider: "infinitepay",
              p_max_installments: 1,
              p_description: description,
              p_expires_at: new Date(now.getTime() + 3650 * 24 * 60 * 60_000).toISOString(),
            } as never,
          );
          if (reserveError) {
            if (reserveError.message.includes("gateway_order_payment_in_progress")) {
              return fail("Já existe uma cobrança em andamento para este pedido. Conclua ou aguarde a confirmação antes de iniciar outra.", 409);
            }
            throw reserveError;
          }
          const { data: attempt, error: loadAttemptError } = await admin
            .from("gateway_payment_attempts" as never)
            .select("id, response_payload, status")
            .eq("id", String(attemptIdFromRpc))
            .single();
          if (loadAttemptError || !attempt) throw loadAttemptError || new Error("Não foi possível recuperar a tentativa.");
          const paymentAttempt = attempt as unknown as Attempt;
          attemptId = paymentAttempt.id;
          if (paymentAttempt.response_payload?.checkoutUrl) return Response.json(paymentAttempt.response_payload);
          if (paymentAttempt.status === "pending") return fail("A cobrança está sendo processada. Aguarde a confirmação antes de tentar novamente.", 409);

          const { data: claim, error: claimError } = await admin.from("gateway_payment_attempts" as never)
            .update({ status: "pending", updated_at: new Date().toISOString() } as never)
            .eq("id", paymentAttempt.id).eq("status", "created")
            .select("id").maybeSingle();
          if (claimError) throw claimError;
          if (!claim) {
            const latest = await admin.from("gateway_payment_attempts" as never)
              .select("response_payload").eq("id", paymentAttempt.id).maybeSingle();
            const latestPayload = (latest.data as unknown as { response_payload?: Record<string, unknown> } | null)?.response_payload;
            if (latestPayload?.checkoutUrl) return Response.json(latestPayload);
            return fail("A cobrança está sendo preparada. Aguarde antes de tentar novamente.", 409);
          }

          const payload: Record<string, unknown> = {
            handle: connection.handle,
            order_nsu: paymentAttempt.id,
            redirect_url: `${origin}/api/infinitepay/return`,
            webhook_url: `${origin}/api/infinitepay/webhook`,
            items: [{ quantity: 1, price: amountCents, description }],
          };
          if (user.email) payload.customer = { name: String(user.user_metadata?.name || "Cliente").slice(0, 100), email: user.email };
          const response = await fetch("https://api.checkout.infinitepay.io/links", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          });
          const result = await response.json() as { url?: string };
          const checkoutUrl = String(result.url || "");
          if (!response.ok || !checkoutUrl) {
            await admin.from("gateway_payment_attempts" as never)
              .update({ status: "failed", updated_at: new Date().toISOString() } as never).eq("id", paymentAttempt.id);
            return fail("A InfinitePay não conseguiu criar a cobrança. Tente novamente.", 502);
          }
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(checkoutUrl);
          } catch {
            await admin.from("gateway_payment_attempts" as never)
              .update({ status: "failed", updated_at: new Date().toISOString() } as never)
              .eq("id", paymentAttempt.id).eq("status", "pending");
            console.error("InfinitePay retornou URL de checkout malformada.");
            return fail("A InfinitePay retornou um link inválido. Tente novamente.", 502);
          }
          const allowedCheckoutHosts = new Set(["checkout.infinitepay.com.br", "checkout.infinitepay.io"]);
          if (
            parsedUrl.protocol !== "https:"
            || !allowedCheckoutHosts.has(parsedUrl.hostname)
            || parsedUrl.port !== ""
            || parsedUrl.username !== ""
            || parsedUrl.password !== ""
          ) {
            await admin.from("gateway_payment_attempts" as never)
              .update({ status: "failed", updated_at: new Date().toISOString() } as never)
              .eq("id", paymentAttempt.id).eq("status", "pending");
            // Logamos somente o domínio, nunca o caminho ou parâmetros que contêm o identificador da cobrança.
            console.error("InfinitePay retornou domínio de checkout não permitido:", parsedUrl.hostname);
            return fail("A InfinitePay retornou um link inválido. Tente novamente.", 502);
          }
          const responsePayload = { checkoutUrl, orderIds };
          const { error: saveError } = await admin.from("gateway_payment_attempts" as never).update({
            status: "pending", provider_resource_id: paymentAttempt.id, response_payload: responsePayload,
            updated_at: new Date().toISOString(),
          } as never).eq("id", paymentAttempt.id);
          if (saveError) throw saveError;
          return Response.json(responsePayload);
        } catch (error) {
          console.error("Erro ao criar cobrança InfinitePay:", error);
          if (attemptId) {
            try {
              await infinitePayAdmin().from("gateway_payment_attempts" as never)
                .update({ status: "failed", updated_at: new Date().toISOString() } as never)
                .eq("id", attemptId).eq("status", "created");
            } catch { /* mantém o erro original */ }
          }
          return fail("Não foi possível iniciar o pagamento pela InfinitePay.", 500);
        }
      },
    },
  },
});
