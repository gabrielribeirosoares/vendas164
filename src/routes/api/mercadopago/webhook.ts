import { createFileRoute } from "@tanstack/react-router";
import { confirmGatewayPayment, gatewayAdmin, getMercadoPagoAccessToken, parsePaymentAttemptReference } from "@/lib/mercadoPago.server";

export const Route = createFileRoute("/api/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const storeId = url.searchParams.get("store_id");
          if (!storeId || !/^[0-9a-f-]{36}$/i.test(storeId)) return new Response("Invalid store", { status: 400 });
          const body = await request.json();
          const type = String(body?.type || url.searchParams.get("type") || url.searchParams.get("topic") || "payment");
          if (type !== "payment" && type !== "order") return Response.json({ received: true });
          const id = String(body?.data?.id || url.searchParams.get("data.id") || "");
          if (!(type === "payment" ? /^\d{1,30}$/.test(id) : /^ORD[A-Za-z0-9]{1,60}$/.test(id))) {
            return new Response("Invalid payment ID", { status: 400 });
          }

          const admin = gatewayAdmin();
          let accessToken: string;
          try { accessToken = await getMercadoPagoAccessToken(storeId); }
          catch { return new Response("Unknown store", { status: 404 }); }

          // The webhook body and return URL are notifications only. Always ask Mercado Pago
          // with this store's own token before changing a financial record.
          const resource = type === "order" ? `v1/orders/${id}` : `v1/payments/${id}`;
          const mpResponse = await fetch(`https://api.mercadopago.com/${resource}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!mpResponse.ok) {
            if (mpResponse.status === 404 || mpResponse.status === 403) return new Response("Payment not found", { status: 404 });
            throw new Error(`Mercado Pago unavailable: ${mpResponse.status}`);
          }
          const mp = await mpResponse.json();
          // An Orders API Pix may also emit a payment notification. Use the same
          // ledger key for both, so one Pix cannot pay the signal and then the
          // remaining balance a second time.
          const linkedOrderId = String(mp.order?.id || "");
          if (type === "payment" && mp.payment_method_id === "pix" && !/^ORD[A-Za-z0-9]+$/.test(linkedOrderId)) {
            return Response.json({ received: true });
          }
          const payment = type === "order" ? {
            id: `order:${mp.id}`,
            status: mp.status === "processed" && mp.status_detail === "accredited" ? "approved" : "pending",
            external_reference: mp.external_reference,
            transaction_amount: Number(mp.total_amount),
            payment_method_id: "pix",
          } : {
            id: /^ORD[A-Za-z0-9]+$/.test(linkedOrderId) ? `order:${linkedOrderId}` : String(mp.id),
            status: mp.status,
            external_reference: mp.external_reference,
            transaction_amount: Number(mp.transaction_amount),
            payment_method_id: mp.payment_method_id,
          };
          if (payment.status === "approved") {
            await confirmGatewayPayment(admin, payment);
          } else {
            const attemptId = parsePaymentAttemptReference(payment.external_reference);
            const terminalStatuses = new Set(["rejected", "cancelled", "refunded", "charged_back"]);
            await admin.from("gateway_payment_attempts" as never).update({
              status: terminalStatuses.has(payment.status) ? "failed" : "pending",
              provider_resource_id: String(mp.id),
              updated_at: new Date().toISOString(),
            } as never).eq("id", attemptId).eq("store_id", storeId).neq("status", "approved");
          }
          return Response.json({ received: true });
        } catch (error) {
          console.error("Não foi possível processar a notificação de pagamento:", error);
          return new Response("Falha temporária na confirmação", { status: 500 });
        }
      },
    },
  },
});
