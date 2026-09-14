import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const badgePath = new URL("../src/components/StatusBadge.tsx", import.meta.url);
const formatPath = new URL("../src/lib/format.ts", import.meta.url);
const ordersPath = new URL("../src/components/vendedor/OrderManager.tsx", import.meta.url);

test("status financeiros seguem uma hierarquia visual consistente", async () => {
  const source = await readFile(badgePath, "utf8");

  assert.match(source, /aguardando_sinal:[\s\S]*border-amber-500/);
  assert.match(source, /sinal_pago:[\s\S]*border-blue-500/);
  assert.match(source, /quitado:[\s\S]*border-emerald-500/);
  assert.match(source, /cancelado:[\s\S]*border-destructive/);
  assert.doesNotMatch(source, /shadow-\[0_0_12px/);
});

test("status de entrega têm ícone, contraste e acessibilidade", async () => {
  const source = await readFile(badgePath, "utf8");

  assert.match(source, /enviado:[\s\S]*icon: Truck/);
  assert.match(source, /em_transito:[\s\S]*icon: Truck/);
  assert.match(source, /entregue:[\s\S]*icon: PackageCheck/);
  assert.match(source, /aria-label=\{\`Status: \$\{label\}\`\}/);
  assert.match(source, /whitespace-normal/);
});

test("pedidos exibem os dois tipos de status e reconhecem enviado", async () => {
  const [format, orders] = await Promise.all([
    readFile(formatPath, "utf8"),
    readFile(ordersPath, "utf8"),
  ]);

  assert.match(format, /enviado: "Enviado"/);
  assert.match(orders, /DeliveryBadge, PaymentBadge/);
  assert.match(orders, /<DeliveryBadge status=\{o\.delivery_status\}/);
  assert.match(orders, /<SelectItem value="enviado">Enviado<\/SelectItem>/);
});
