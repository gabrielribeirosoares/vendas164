import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function gatewayAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração de pagamentos indisponível.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export function pendingAmount(order: {
  total_price: number | null;
  down_payment: number | null;
  payment_status: string | null;
}) {
  const total = Number(order.total_price);
  const signal = Number(order.down_payment || 0);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(signal) || signal < 0 || signal > total) {
    throw new Error("Valor do pedido inválido.");
  }
  let amount: number;
  switch (order.payment_status) {
    case "aguardando_sinal": amount = signal > 0 ? signal : total; break;
    case "sinal_pago": amount = total - signal; break;
    case "pendente": amount = total; break;
    default: throw new Error("Pedido indisponível para pagamento.");
  }
  if (amount <= 0) throw new Error("Pedido já está pago.");
  return Math.round(amount * 100);
}

export function parseOrderIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) throw new Error("Pedidos inválidos.");
  const ids = value.map((id) => String(id));
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Pedidos inválidos.");
  }
  return ids.sort();
}

export function paymentAttemptReference(attemptId: string) {
  return `v164:${attemptId}`;
}

export function paymentAttemptKey(storeId: string, userId: string, orderIds: string[], amountCents: number, method: string) {
  return createHash("sha256").update(JSON.stringify([storeId, userId, orderIds, amountCents, method])).digest("hex");
}

export function parsePaymentAttemptReference(value: unknown) {
  const match = String(value || "").match(/^v164:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if (!match) throw new Error("Referência de pagamento inválida.");
  return match[1].toLowerCase();
}

export async function confirmGatewayPayment(
  admin: ReturnType<typeof gatewayAdmin>,
  payment: { id: string; status: string; external_reference: string; transaction_amount: number; payment_method_id?: string },
) {
  if (payment.status !== "approved") return false;
  const attemptId = parsePaymentAttemptReference(payment.external_reference);
  const amount = Number(payment.transaction_amount);
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001) {
    throw new Error("Valor do pagamento inválido.");
  }
  const { data, error } = await admin.rpc("confirm_gateway_payment_attempt" as never, {
    p_attempt_id: attemptId,
    p_amount: amount,
    p_payment_method: payment.payment_method_id || "mercadopago",
    p_gateway_id: payment.id,
  } as never);
  if (error) throw error;
  return Boolean((data as { success?: boolean } | null)?.success);
}
