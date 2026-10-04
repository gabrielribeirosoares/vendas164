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

test('Customer panel unifies reservation payments and opens the configured checkout', async () => {
  const painel = await read('src/routes/_authenticated/painel.tsx');

  assert.match(painel, /import \{ CheckoutPaymentDialog \} from "@\/|import\("@\/components\/CheckoutPaymentDialog"\)/);
  assert.match(painel, /Reservas e pagamentos/);
  assert.match(painel, /Pagamento consolidado/);
  assert.match(painel, /Escolher forma de pagamento/);
  assert.doesNotMatch(painel, /Pagar com PIX ou Cartão|via PIX/);
  assert.match(painel, /selectedOrderIds/);
  assert.match(painel, /handlePaySelectedOrders/);
});

test('Seller status changes require explicit confirmation, including batch actions', async () => {
  const orderManager = await read('src/components/vendedor/OrderManager.tsx');

  assert.match(orderManager, /setPendingStatusChange\(\{ kind: 'payment'/);
  assert.match(orderManager, /setPendingStatusChange\(\{ kind: 'delivery'/);
  assert.match(orderManager, /setPendingStatusChange\(\{\s*kind: statusType/);
  assert.match(orderManager, /<AlertDialog/);
  assert.match(orderManager, /Confirmar situação financeira\?/);
  assert.match(orderManager, /Confirmar status do envio\?/);
  assert.match(orderManager, /Confirme somente após verificar o recebimento/);
});

test('Seller reservations expose quick workflow filters for payment and shipping', async () => {
  const orderManager = await read('src/components/vendedor/OrderManager.tsx');

  const summary = await read('src/components/vendedor/SellerWorkflowSummary.tsx');
  assert.match(orderManager, /SellerWorkflowSummary/);
  assert.match(summary, /Atendimento por etapa/);
  assert.match(summary, /Aguardando sinal/);
  assert.match(summary, /Saldo após sinal/);
  assert.match(summary, /Preparar envio/);
  assert.match(summary, /Em trânsito/);
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
