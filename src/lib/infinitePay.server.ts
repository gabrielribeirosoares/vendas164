import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function infinitePayAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração de pagamentos indisponível.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export function appBaseUrl() {
  const value = process.env.APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.vendas164.com.br");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("A URL pública da aplicação precisa usar HTTPS.");
  }
  return url.origin;
}

export function normalizeInfinitePayHandle(value: unknown) {
  const handle = String(value || "").trim().replace(/^\$/, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,59}$/.test(handle)) {
    throw new Error("Informe uma InfiniteTag válida, sem o símbolo $.");
  }
  return handle;
}

type PaymentAttempt = {
  id: string;
  store_id: string;
  amount: number;
  status: string;
  provider: string;
  provider_payment_id: string | null;
};

export async function verifyAndConfirmInfinitePay(orderNsu: string, transactionNsu: string, slug: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderNsu)) {
    throw new Error("Referência de pedido inválida.");
  }
  if (transactionNsu.length < 3 || transactionNsu.length > 120 || slug.length < 1 || slug.length > 120) {
    throw new Error("Dados de confirmação inválidos.");
  }

  const admin = infinitePayAdmin();
  const { data: rawAttempt, error: attemptError } = await admin
    .from("gateway_payment_attempts" as never)
    .select("id, store_id, amount, status, provider, provider_payment_id")
    .eq("id", orderNsu)
    .maybeSingle();
  if (attemptError || !rawAttempt) throw new Error("Tentativa de pagamento não encontrada.");
  const attempt = rawAttempt as unknown as PaymentAttempt;
  if (attempt.provider !== "infinitepay") throw new Error("Esta cobrança pertence a outro meio de pagamento.");

  const { data: rawConnection, error: connectionError } = await admin
    .from("infinitepay_connections" as never)
    .select("handle, is_active")
    .eq("store_id", attempt.store_id)
    .maybeSingle();
  const connection = rawConnection as unknown as { handle: string; is_active: boolean } | null;
  if (connectionError || !connection?.is_active) throw new Error("Conta InfinitePay desconectada.");

  const response = await fetch("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      handle: connection.handle,
      order_nsu: attempt.id,
      transaction_nsu: transactionNsu,
      slug,
    }),
  });
  if (!response.ok) throw new Error("Não foi possível verificar o pagamento na InfinitePay.");
  const check = await response.json() as {
    success?: boolean; paid?: boolean; amount?: number; capture_method?: string;
  };
  const expectedCents = Math.round(Number(attempt.amount) * 100);
  if (!check.success || !check.paid || Number(check.amount) !== expectedCents) {
    throw new Error("A InfinitePay ainda não confirmou o valor integral do pedido.");
  }
  if (!["pix", "credit_card"].includes(String(check.capture_method))) {
    throw new Error("Forma de pagamento retornada pela InfinitePay é inválida.");
  }

  const paymentMethod = check.capture_method === "pix" ? "infinitepay_pix" : "infinitepay_credit_card";
  const { data, error } = await admin.rpc("confirm_gateway_payment_attempt" as never, {
    p_attempt_id: attempt.id,
    p_amount: Number(attempt.amount),
    p_payment_method: paymentMethod,
    p_gateway_id: transactionNsu,
  } as never);
  if (error) throw new Error("Não foi possível confirmar o pedido no sistema.");
  const result = data as { success?: boolean } | null;
  if (!result?.success) throw new Error("A confirmação do pagamento não foi concluída.");
  await admin.from("gateway_payment_attempts" as never).update({
    provider_resource_id: slug,
    provider_payment_id: transactionNsu,
    updated_at: new Date().toISOString(),
  } as never).eq("id", attempt.id);
  return { success: true, attemptId: attempt.id };
}
