export const brl = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));

export const paymentLabels: Record<string, string> = {
  aguardando_sinal: "Aguardando sinal",
  sem_sinal: "Sem sinal / Pagar na chegada",
  pagar_na_chegada: "Sem sinal / Pagar na chegada",
  sinal_pago: "Sinal pago",
  quitado: "Quitado",
  cancelado: "Cancelado",
};

export const deliveryLabels: Record<string, string> = {
  pendente: "Pendente",
  em_transito: "Em trânsito",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function whatsappLink(number: string | null | undefined, message: string) {
  const digits = (number ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function formatDeadlineHours(hours: number | null | undefined): string {
  if (!hours || hours === 0) return "Sem sinal";
  if (hours < 24) return `${hours} horas`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  if (remaining === 0) {
    return `${days} ${days === 1 ? "dia" : "dias"}`;
  }
  return `${days} ${days === 1 ? "dia" : "dias"} e ${remaining}h`;
}

export function getProductInstallmentInfo(product: any) {
  const maxInst = Number(product?.max_installments ?? 1);
  if (maxInst <= 1) return null;

  const cashPrice = Number(product?.price ?? 0);
  const instPriceRaw = product?.installment_price ?? product?.price_2x;
  const hasSurcharge =
    product?.has_installment_surcharge === true ||
    (instPriceRaw != null && Number(instPriceRaw) > cashPrice);

  const totalPrice = hasSurcharge && instPriceRaw != null && Number(instPriceRaw) > 0
    ? Number(instPriceRaw)
    : cashPrice;
  const installmentValue = totalPrice / maxInst;

  return {
    maxInstallments: maxInst,
    hasSurcharge,
    totalPrice,
    installmentValue,
  };
}

/**
 * Retorna a lista de opções de parcelamento para um produto.
 * Ex: [{ value: 1, label: "À vista — R$ 100,00" }, { value: 2, label: "2x de R$ 51,00 (Total R$ 102,00)" }, ...]
 */
export function getInstallmentOptions(product: any): { value: number; label: string; totalPrice: number }[] {
  const cashPrice = Number(product?.price ?? 0);
  const maxInst = Number(product?.max_installments && Number(product.max_installments) > 0 ? product.max_installments : 12);
  const instPriceRaw = product?.installment_price ?? product?.price_2x;
  const hasSurcharge =
    product?.has_installment_surcharge === true ||
    (instPriceRaw != null && Number(instPriceRaw) > cashPrice);
  const instTotal = hasSurcharge && instPriceRaw != null && Number(instPriceRaw) > 0
    ? Number(instPriceRaw)
    : cashPrice;

  const options: { value: number; label: string; totalPrice: number }[] = [
    { value: 1, label: `À vista — ${brl(cashPrice)}`, totalPrice: cashPrice },
  ];

  for (let i = 2; i <= maxInst; i++) {
    const parcelValue = instTotal / i;
    const label = hasSurcharge
      ? `${i}x de ${brl(parcelValue)} (Total ${brl(instTotal)})`
      : `${i}x de ${brl(parcelValue)} (sem acréscimo)`;
    options.push({ value: i, label, totalPrice: instTotal });
  }

  return options;
}

/**
 * Formata a condição de pagamento escolhida para exibição.
 * Ex: "À vista", "3x de R$ 45,00", "3x de R$ 45,00 (Total R$ 135,00)"
 */
export function formatOrderPaymentCondition(order: any, product: any): string | null {
  const count = Number(order?.installment_count ?? 0);
  const cashPrice = Number(product?.price ?? order?.total_price ?? 0);
  const instPriceRaw = product?.installment_price ?? product?.price_2x;
  const hasSurcharge =
    product?.has_installment_surcharge === true ||
    (instPriceRaw != null && Number(instPriceRaw) > cashPrice);
  const instTotal = hasSurcharge && instPriceRaw != null && Number(instPriceRaw) > 0
    ? Number(instPriceRaw)
    : Number(order?.total_price ?? cashPrice);

  if (!count || count <= 1) {
    return "À vista";
  }
  const parcelValue = instTotal / count;
  if (hasSurcharge) {
    return `${count}x de ${brl(parcelValue)} (Total ${brl(instTotal)})`;
  }
  return `${count}x de ${brl(parcelValue)}`;
}
