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
