import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeClientOrders } from '../src/lib/clientOrderSummary.ts';
const row = extras => ({ total_price: 100, down_payment: 0, signal_amount: 20, payment_status: 'aguardando_sinal', delivery_status: 'pendente', order_installments: [], ...extras });
test('client summary excludes cancellations and treats fully paid orders as settled without duplicate receipts', () => {
  const result = summarizeClientOrders([
    row({ payment_status: 'quitado' }),
    row({ payment_status: 'sinal_pago', down_payment: 20, order_installments: [{status:'paid', amount:30}] }),
    row({ payment_status: 'cancelado' }),
    row({ delivery_status: 'cancelado' }),
    row({ delivery_status: 'entregue' }),
  ]);
  assert.equal(result.totalSpent, 300);
  assert.equal(result.totalPaid, 150);
  assert.equal(result.remainingBalance, 150);
  assert.equal(result.totalItems, 3);
  assert.equal(result.pendingItems, 2);
  assert.equal(result.progressPercent, 50);
});
test('empty history and cent values remain consistent', () => {
  assert.equal(summarizeClientOrders([]).remainingBalance, 0);
  const result = summarizeClientOrders([row({total_price:0.3,payment_status:'sinal_pago',down_payment:0.1,order_installments:[{status:'paid',amount:0.1}]})]);
  assert.equal(result.totalPaid, 0.2);
  assert.equal(result.remainingBalance, 0.1);
});
