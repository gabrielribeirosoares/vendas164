import { summarizeReservation } from "./reservationSummary.ts";

type ClientOrder = Parameters<typeof summarizeReservation>[0][number];
export function summarizeClientOrders(orders: ClientOrder[]) {
  const active = orders.filter(order => order.payment_status !== "cancelado" && order.delivery_status !== "cancelado");
  const financial = summarizeReservation(active);
  return {
    totalSpent: financial.total,
    totalPaid: financial.received,
    remainingBalance: financial.balance,
    totalItems: active.length,
    pendingItems: active.filter(order => summarizeReservation([order]).balance > 0).length,
    progressPercent: financial.total > 0 ? Math.min(100, Math.round(financial.received / financial.total * 100)) : 0,
  };
}
