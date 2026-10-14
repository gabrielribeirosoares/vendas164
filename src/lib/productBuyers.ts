import { packingCustomerIdentity, type PackingOrder } from "./customerPacking";
import { summarizeReservation } from "./reservationSummary";
export type BuyerOrder = PackingOrder & {
  total_price: number;
  down_payment: number;
  signal_amount: number | null;
  order_installments?: Array<{ amount: number; status: string }>;
};
export async function loadBuyerPages<T>(fetchPage: (offset: number) => Promise<T[]>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await fetchPage(offset);
    rows.push(...page);
    if (page.length < 100) break;
  }
  return rows;
}
export function groupProductBuyers(orders: BuyerOrder[], productId: string) {
  const unique = [
    ...new Map(
      orders
        .filter(
          (o) =>
            o.product_id === productId &&
            o.payment_status !== "cancelado" &&
            o.delivery_status !== "cancelado",
        )
        .map((o) => [o.id, o]),
    ).values(),
  ];
  const customers = new Map<
    string,
    { key: string; name: string; phone: string | null; email: string | null; orders: BuyerOrder[] }
  >();
  for (const order of unique) {
    const identity = packingCustomerIdentity(order);
    let customer = customers.get(identity.key);
    if (!customer) {
      customer = { ...identity, orders: [] };
      customers.set(identity.key, customer);
    }
    customer.orders.push(order);
  }
  return [...customers.values()]
    .map((customer) => {
      const summary = summarizeReservation(customer.orders);
      const variants = new Map<
        string,
        { key: string; name: string; imageUrl: string | null; quantity: number }
      >();
      for (const order of customer.orders) {
        const key = order.variant_id || "";
        const line = variants.get(key) || {
          key,
          name: order.variant_name || "Padrão",
          imageUrl: order.variant_image_url || order.products?.image_url || null,
          quantity: 0,
        };
        line.quantity++;
        variants.set(key, line);
      }
      return {
        ...customer,
        quantity: customer.orders.length,
        summary,
        variants: [...variants.values()],
        awaitingSignal: customer.orders.filter((o) => o.payment_status === "aguardando_sinal")
          .length,
        pendingPayments: customer.orders.filter((o) => summarizeReservation([o]).balance > 0)
          .length,
        pendingShipping: customer.orders.filter((o) => o.delivery_status === "pendente").length,
        paid: customer.orders.filter((o) => o.payment_status === "quitado").length,
        delivered: customer.orders.filter((o) => o.delivery_status === "entregue").length,
        sent: customer.orders.filter((o) => ["enviado", "em_transito"].includes(o.delivery_status))
          .length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
