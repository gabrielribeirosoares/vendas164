type ReservationFinancialRow = {
  total_price: number;
  down_payment: number;
  signal_amount: number | null;
  payment_status: string;
  delivery_status: string;
  order_installments?: Array<{ amount: number; status: string }>;
};

const cents = (value: number) => Math.max(0, Math.round(Number(value || 0) * 100));

/** Each database order represents one unit. Never multiply grouped installments. */
export function summarizeReservation(rows: ReservationFinancialRow[]) {
  let total = 0;
  let received = 0;
  let balance = 0;
  let dueNow = 0;
  for (const row of rows) {
    const unitTotal = cents(row.total_price);
    const paidInstallments = (row.order_installments || [])
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + cents(item.amount), 0);
    const paidSignal = ["sinal_pago", "quitado"].includes(row.payment_status)
      ? cents(row.down_payment)
      : 0;
    const unitReceived =
      row.payment_status === "quitado"
        ? unitTotal
        : Math.min(unitTotal, paidSignal + paidInstallments);
    const cancelled = row.payment_status === "cancelado" || row.delivery_status === "cancelado";
    const unitBalance = cancelled ? 0 : Math.max(0, unitTotal - unitReceived);
    total += unitTotal;
    received += unitReceived;
    balance += unitBalance;
    dueNow +=
      row.payment_status === "aguardando_sinal"
        ? Math.min(unitBalance, Math.max(0, cents(row.signal_amount ?? 0) - unitReceived))
        : unitBalance;
  }
  return {
    total: total / 100,
    received: received / 100,
    balance: balance / 100,
    dueNow: dueNow / 100,
  };
}
