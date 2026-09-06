import { supabase } from "@/integrations/supabase/client";

export async function linkCustomerToStore(userId: string, storeId: string) {
  await supabase.from("customer_store_link").insert({ user_id: userId, store_id: storeId });
}

export interface CheckoutItem {
  product_id: string;
  quantity: number;
  installments: number;
  expected_total: number;
  expected_signal: number;
}

export async function checkoutCart(requestId: string, items: CheckoutItem[]) {
  const { data, error } = await supabase.rpc("checkout_cart", {
    _request_id: requestId,
    _items: items,
  });
  if (error) throw error;
  if (!data?.length) throw new Error("empty_checkout");
  return data;
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

  const err = error as { message?: string; details?: string; hint?: string; code?: string };
  const message = String(err?.message || err?.details || error || "");
  if (message.includes("out_of_stock")) return "Unidades esgotadas. Entre na fila de espera.";
  if (message.includes("presale_closed")) return "Esta pré-venda está fechada.";
  if (message.includes("not_authenticated")) return "Faça login para reservar.";
  if (message.includes("product_not_found")) return "Produto não encontrado ou indisponível.";
  if (message.includes("price_changed")) return "O preço ou o sinal mudou. Atualize os valores do carrinho antes de confirmar.";
  if (message.includes("invalid_installments")) return "O parcelamento selecionado não está mais disponível. Revise o produto.";
  if (message.includes("own_store")) return "Use o painel do vendedor para cadastrar reservas da sua própria loja.";
  if (message.includes("invalid_quantity") || message.includes("invalid_cart")) return "Revise as quantidades do carrinho (máximo de 100 unidades).";
  if (message.includes("checkout_conflict")) return "Esta tentativa já foi registrada com outros itens. Reabra o carrinho para conferir.";
  return "Não foi possível concluir a reserva.";
}
