import test from 'node:test';
import assert from 'node:assert/strict';
import { getSellerNavigation } from '../src/lib/sellerNavigation.ts';

test('navigation exposes wheels and moderation only to eligible stores and administrators', () => {
  const ids = (wheels, admin) => getSellerNavigation(wheels, admin).map(item => item.id);
  assert.equal(ids(false, false).includes('rodinhas'), false);
  assert.equal(ids(false, false).includes('admin_moderation'), false);
  assert.equal(ids(true, false).includes('rodinhas'), true);
  assert.equal(ids(true, false).includes('admin_moderation'), false);
  assert.equal(ids(false, true).includes('admin_moderation'), true);
  const all = ids(true, true);
  assert.equal(new Set(all).size, all.length);
  for (const id of ['produtos', 'pronta_entrega', 'reservas', 'clientes', 'fila_espera', 'rastreamento', 'loja', 'pagamentos']) assert.ok(all.includes(id));
});
