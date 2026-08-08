import { supabase } from "@/integrations/supabase/client";

export async function linkCustomerToStore(userId: string, storeId: string) {
  await supabase.from("customer_store_link").insert({ user_id: userId, store_id: storeId });
}

export async function reserveQuota(productId: string) {
  const { data, error } = await supabase.rpc("create_reservation", { _product_id: productId });
  if (error) throw error;
  return data as string;
}

export async function joinWaitlist(userId: string, productId: string, storeId: string) {
  const { error } = await supabase
    .from("waitlist")
    .insert({ user_id: userId, product_id: productId, store_id: storeId });
  if (error && error.code !== "23505") throw error;
  await supabase
    .from("customer_store_link")
    .insert({ user_id: userId, store_id: storeId })
    .then(() => undefined);
}

export function reservationErrorMessage(error: unknown) {
  console.error("[reservationErrorMessage] Error details:", error);
  const err = error as { message?: string; details?: string; hint?: string; code?: string };
  const message = String(err?.message || err?.details || error || "");
  if (message.includes("out_of_stock")) return "Unidades esgotadas. Entre na fila de espera.";
  if (message.includes("presale_closed")) return "Esta pré-venda está fechada.";
  if (message.includes("not_authenticated")) return "Faça login para reservar.";
  if (message.includes("product_not_found")) return "Produto não encontrado ou indisponível.";
  if (err?.message) return `Não foi possível concluir a reserva: ${err.message}`;
  return "Não foi possível concluir a reserva.";
}
