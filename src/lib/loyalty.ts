import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
export type LoyaltyProgram = {
  store_id: string;
  enabled: boolean;
  started_at: string;
  spend_cents: number;
  coins_per_step: number;
  rule_id: string;
  name?: string;
};
export type LoyaltyAccount = {
  user_id: string;
  balance: number;
  deficit: number;
  remainder_cents: number;
  next_spend_cents: number;
  next_coins: number;
  previous_rule: boolean;
  customer_name: string | null;
};
export type LoyaltyReward = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  coins: number;
  stock: number;
  active: boolean;
  per_customer_limit: number | null;
};
export type RedemptionStatus = "pending" | "approved" | "shipped" | "delivered" | "rejected";
export type LoyaltyRedemption = {
  id: string;
  user_id: string;
  customer_name?: string;
  reward_id: string;
  reward_name: string;
  coins: number;
  status: RedemptionStatus;
  created_at: string;
};
export type LoyaltyEntry = {
  id: string;
  user_id: string;
  coins: number;
  eligible_cents: number;
  reason: string;
  created_at: string;
};
export type LoyaltyData = {
  configurable_rules?: boolean;
  program: LoyaltyProgram | null;
  accounts: LoyaltyAccount[];
  rewards: LoyaltyReward[];
  redemptions: LoyaltyRedemption[];
  ledger: LoyaltyEntry[];
};
export const redemptionLabels: Record<RedemptionStatus, string> = {
  pending: "Aguardando aprovação",
  approved: "Aprovado",
  shipped: "Enviado",
  delivered: "Entregue",
  rejected: "Recusado — Coins devolvidos",
};
export async function getLoyaltyData(
  storeId: string,
  customerId?: string,
  offset = 0,
  search = "",
) {
  const { data, error } = await supabase.rpc("loyalty_data", {
    _store_id: storeId,
    _customer_id: customerId,
    _offset: offset,
    _search: search,
  });
  if (error) throw error;
  return data as unknown as LoyaltyData;
}
export async function loyaltyCommand(
  storeId: string,
  action: "configure" | "reward" | "adjust" | "redeem" | "redemption_status",
  payload: Json,
) {
  const { data, error } = await supabase.rpc("loyalty_command", {
    _store_id: storeId,
    _action: action,
    _data: payload,
  });
  if (error) throw error;
  return data;
}
export function loyaltyError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const messages: Record<string, string> = {
    loyalty_rule_changed: "A regra foi alterada em outra tela. Atualize os dados antes de salvar.",
    loyalty_invalid_rule: "Informe Coins inteiros e um valor pago maior que zero.",
    loyalty_stock_changed:
      "O estoque mudou após um resgate. Feche a edição e abra novamente para atualizar.",
    loyalty_reward_capacity:
      "Esta loja já tem 100 recompensas. Edite ou reutilize uma das existentes.",
    loyalty_insufficient_balance: "Saldo de Coins insuficiente.",
    loyalty_paused: "O programa está pausado.",
    loyalty_reward_unavailable: "Recompensa indisponível ou sem estoque.",
    loyalty_reward_changed: "Os Coins exigidos mudaram. Atualize a lista e confirme novamente.",
    loyalty_reward_limit: "Você já atingiu o limite de resgates desta recompensa.",
    loyalty_forbidden: "Você não tem permissão para esta ação.",
    loyalty_invalid_status: "Esta mudança de status não é permitida.",
    loyalty_customer_not_found: "Cliente não encontrado nesta loja.",
  };
  return (
    Object.entries(messages).find(([key]) => message.includes(key))?.[1] ||
    "Não foi possível concluir. Atualize os dados e tente novamente."
  );
}
