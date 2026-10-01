import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PIX generator produces compliant BACEN BR Code format with CRC16', async () => {
  const pixLib = await read('src/lib/pix.ts');

  assert.match(pixLib, /export function generatePixCopiaECola/);
  assert.match(pixLib, /br\.gov\.bcb\.pix/);
  assert.match(pixLib, /crc16/);
  assert.match(pixLib, /QRCode\.toDataURL/);
});

test('Customer panel integrates PixPaymentDialog with prefilled amount and QR Code', async () => {
  const painel = await read('src/routes/_authenticated/painel.tsx');

  assert.match(painel, /import \{[^}]*PixPaymentDialog[^}]*\} from "@/);
  assert.match(painel, /Pagar com PIX/);
  assert.match(painel, /<PixPaymentDialog/);
  assert.match(painel, /selectedOrderIds/);
  assert.match(painel, /handlePaySelectedOrders/);
});

test('OrderManager integrates PackingSlipDialog for batch sorting and dispatch', async () => {
  const orderManager = await read('src/components/vendedor/OrderManager.tsx');
  const packingSlip = await read('src/components/vendedor/PackingSlipDialog.tsx');

  assert.match(orderManager, /PackingSlipDialog/);
  assert.match(orderManager, /Romaneio de Envio/);
  assert.match(packingSlip, /Imprimir Romaneio/);
  assert.match(packingSlip, /Exportar CSV/);
  assert.match(packingSlip, /Marcar todos como conferidos/);
});
