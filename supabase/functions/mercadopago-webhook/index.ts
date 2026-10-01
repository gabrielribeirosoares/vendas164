const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const attemptPattern = /^v164:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function apiHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceKey) return json({ error: "server_configuration_error" }, 500);

  try {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("store_id") || "";
    if (!uuidPattern.test(storeId)) return json({ error: "invalid_store" }, 400);

    const body = await request.json().catch(() => ({}));
    const type = String(body?.type || url.searchParams.get("type") || url.searchParams.get("topic") || "payment");
    if (type !== "payment" && type !== "order") return json({ received: true });

    const id = String(body?.data?.id || url.searchParams.get("data.id") || "");
    if (!(type === "payment" ? /^\\d{1,30}$/.test(id) : /^ORD[A-Za-z0-9]{1,60}$/.test(id))) {
      return json({ error: "invalid_payment_id" }, 400);
    }

    const headers = apiHeaders(serviceKey);
    const connectionUrl = new URL("/rest/v1/mercadopago_connections", projectUrl);
    connectionUrl.search = new URLSearchParams({
      select: "store_id,access_token,is_active",
      store_id: `eq.${storeId}`,
      limit: "1",
    }).toString();
    const connectionResponse = await fetch(connectionUrl, { headers });
    if (!connectionResponse.ok) throw new Error("connection_lookup_failed");
    const rows = await connectionResponse.json();
    const connection = rows?.[0];
    if (!connection?.is_active || !connection?.access_token) {
      // The current manual connection stores its token in access_token.
      // OAuth-encrypted connections require the dedicated decryption/refresh secret.
      return json({ error: "store_connection_unavailable" }, 404);
    }

    const resource = type === "order" ? `v1/orders/${id}` : `v1/payments/${id}`;
    const mpResponse = await fetch(`https://api.mercadopago.com/${resource}`, {
      headers: { Authorization: `Bearer ${connection.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (mpResponse.status === 404 || mpResponse.status === 403) return json({ error: "payment_not_found" }, 404);
    if (!mpResponse.ok) throw new Error(`mercadopago_lookup_failed_${mpResponse.status}`);

    const mp = await mpResponse.json();
    const externalReference = String(mp.external_reference || "");
    const referenceMatch = externalReference.match(attemptPattern);
    if (!referenceMatch) return json({ received: true, ignored: true });

    const attemptId = referenceMatch[1].toLowerCase();
    const attemptUrl = new URL("/rest/v1/gateway_payment_attempts", projectUrl);
    attemptUrl.search = new URLSearchParams({
      select: "id,store_id,provider,status",
      id: `eq.${attemptId}`,
      store_id: `eq.${storeId}`,
      provider: "eq.mercadopago",
      limit: "1",
    }).toString();
    const attemptResponse = await fetch(attemptUrl, { headers });
    if (!attemptResponse.ok) throw new Error("attempt_lookup_failed");
    const attempts = await attemptResponse.json();
    if (!attempts?.length) return json({ received: true, ignored: true });

    const linkedOrderId = String(mp.order?.id || "");
    if (type === "payment" && mp.payment_method_id === "pix" && linkedOrderId && !/^ORD[A-Za-z0-9]+$/.test(linkedOrderId)) {
      return json({ received: true });
    }
    const paymentId = type === "order"
      ? `order:${mp.id}`
      : /^ORD[A-Za-z0-9]+$/.test(linkedOrderId) ? `order:${linkedOrderId}` : String(mp.id);
    const status = type === "order"
      ? mp.status === "processed" && mp.status_detail === "accredited" ? "approved" : "pending"
      : String(mp.status || "pending");
    const amount = type === "order" ? Number(mp.total_amount) : Number(mp.transaction_amount);

    if (status === "approved") {
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: "invalid_payment_amount" }, 400);
      const confirmation = await fetch(new URL("/rest/v1/rpc/confirm_gateway_payment_attempt", projectUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_attempt_id: attemptId,
          p_amount: amount,
          p_payment_method: String(mp.payment_method_id || "mercadopago"),
          p_gateway_id: paymentId,
        }),
      });
      if (!confirmation.ok) {
        const reason = await confirmation.text();
        console.error("Payment confirmation RPC rejected callback:", confirmation.status, reason.slice(0, 180));
        throw new Error("payment_confirmation_failed");
      }
    } else {
      const terminal = new Set(["rejected", "cancelled", "refunded", "charged_back"]);
      const updateUrl = new URL("/rest/v1/gateway_payment_attempts", projectUrl);
      updateUrl.search = new URLSearchParams({
        id: `eq.${attemptId}`,
        store_id: `eq.${storeId}`,
        status: "neq.approved",
      }).toString();
      const update = await fetch(updateUrl, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: terminal.has(status) ? "failed" : "pending",
          provider_resource_id: String(mp.id),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!update.ok) throw new Error("attempt_update_failed");
    }

    return json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("Mercado Pago webhook processing failed:", message);
    return json({ error: "temporary_processing_failure" }, 500);
  }
});
