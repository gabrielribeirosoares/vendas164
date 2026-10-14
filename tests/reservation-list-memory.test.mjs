import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationListKey, readReservationList, saveReservationList } from '../src/lib/reservationListMemory.ts';

test('returning to reservations restores filters, page and scroll without sharing account or store state', () => {
  const key = reservationListKey('seller-a', 'store-a');
  const saved = { ...readReservationList(key), page: 3, pageSize: 50, searchQuery: 'Mini GT', paymentFilter: 'sinal_pago', listScroll: 900, windowScroll: 250 };
  saveReservationList(key, saved);
  saved.page = 99;
  const restored = readReservationList(key);
  assert.equal(restored.page, 3);
  assert.equal(restored.pageSize, 50);
  assert.equal(restored.searchQuery, 'Mini GT');
  assert.equal(restored.paymentFilter, 'sinal_pago');
  assert.equal(restored.listScroll, 900);
  assert.equal(restored.windowScroll, 250);
  restored.page = 99;
  assert.equal(readReservationList(key).page, 3);
  for (const isolated of [reservationListKey('seller-b', 'store-a'), reservationListKey('seller-a', 'store-b'), reservationListKey('seller-a', 'store-a', 'vencendo')]) {
    assert.equal(readReservationList(isolated).page, 0);
    assert.equal(readReservationList(isolated).searchQuery, '');
  }
  assert.equal('selectedOrders' in restored, false);
});

test('list memory stays bounded during a long session', () => {
  const first = reservationListKey('bounded', '0');
  saveReservationList(first, { ...readReservationList(first), page: 2 });
  for (let i = 1; i <= 30; i++) {
    const key = reservationListKey('bounded', String(i));
    saveReservationList(key, readReservationList(key));
  }
  assert.equal(readReservationList(first).page, 0);
});
