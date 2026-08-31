import { supabase } from "@/integrations/supabase/client";
import { getProductSignalAmount } from "./format";

export async function linkCustomerToStore(userId: string, storeId: string) {
  await supabase.from("customer_store_link").insert({ user_id: userId, store_id: storeId });
}

export async function reserveQuota(productId: string, installmentCount?: number, finalTotalPrice?: number) {
  const { data, error } = await supabase.rpc("create_reservation", { _product_id: productId });
  if (error) throw error;
  const orderId = data as string;
  // Salvar parcelamento e preço final diretamente no insert via update logo após criação
  const count = installmentCount || 1;
  const payload: any = { installment_count: count };
  if (finalTotalPrice && finalTotalPrice > 0) {
    payload.total_price = finalTotalPrice;
  }
  await supabase.from("orders").update(payload).eq("id", orderId);
  
  // Gerar as parcelas automaticamente
  const { data: orderData } = await supabase.from("orders").select("total_price, stores(default_installment_due_day), products(*)").eq("id", orderId).maybeSingle();
  if (orderData) {
    const signalInfo = getProductSignalAmount(orderData.products, 1);
    const amountToParcel = Math.max(0, Number(orderData.total_price) - signalInfo.amount);
    const amountPerInstallment = amountToParcel / count;
    const defaultDay = (orderData.stores as any)?.default_installment_due_day;
    const now = new Date();
    const newInstallments = Array.from({ length: count }).map((_, i) => {
        // Criamos a data pro dia 1 do mês futuro para evitar o bug do dia 31 pular para o próximo mês
        const futureYear = now.getFullYear();
        const futureMonth = now.getMonth() + i + 1;
        
        let dueDate: Date;
        if (defaultDay && defaultDay >= 1 && defaultDay <= 31) {
          dueDate = new Date(futureYear, futureMonth, 1);
          const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
          dueDate.setDate(Math.min(defaultDay, lastDayOfMonth));
        } else {
          // Lógica padrão: Tenta manter o dia original, mas se o mês futuro for menor que o dia original, ajusta pro último dia
          dueDate = new Date(futureYear, futureMonth, now.getDate());
          if (dueDate.getMonth() !== futureMonth % 12) {
            dueDate.setDate(0);
          }
        }
        return {
          order_id: orderId,
          installment_number: i + 1,
          amount: amountPerInstallment,
          due_date: dueDate.toISOString(),
          status: "pending"
        };
      });
      await supabase.from("order_installments").insert(newInstallments);
  }
  return orderId;
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
