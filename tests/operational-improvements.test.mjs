import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("vitrine pagina e filtra produtos no servidor", async () => {
  const route = await read("src/routes/loja.$slug.tsx");

  assert.match(route, /supabase\.rpc\("catalog_page"/);
  assert.match(route, /_page: currentPage/);
  assert.match(route, /_page_size: itemsPerPage/);
  assert.match(route, /placeholderData: \(previous\) => previous/);
  assert.doesNotMatch(route, /filteredProducts\.slice/);
  assert.doesNotMatch(route, /\.from\("products"\)[\s\S]{0,160}\.eq\("store_id", store\.id\)/);
});

test("listas operacionais usam miniaturas otimizadas", async () => {
  const thumbnail = await read("src/components/ProductThumbnail.tsx");
  const files = await Promise.all([
    read("src/components/vendedor/OrderManager.tsx"),
    read("src/components/vendedor/ClientsManager.tsx"),
    read("src/components/vendedor/WaitlistManager.tsx"),
    read("src/routes/_authenticated/painel.tsx"),
  ]);

  assert.match(thumbnail, /getProductCardImageUrl\(src\)/);
  assert.match(thumbnail, /decoding="async"/);
  files.forEach((source) => assert.match(source, /ProductThumbnail/));
});

test("gestão financeira oferece operações transacionais e autorização explícita", async () => {
  const migration = await read(
    "supabase/migrations/20260922183409_atomic_order_financial_management.sql",
  );
  const dialog = await read("src/components/vendedor/OrderInstallmentsDialog.tsx");

  assert.match(migration, /FUNCTION public\.replace_order_installments/);
  assert.match(migration, /FUNCTION public\.record_order_payment/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /public\.is_store_owner\(o\.store_id\)/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated, service_role/);
  assert.match(dialog, /supabase\.rpc\("replace_order_installments"/);
  assert.match(dialog, /supabase\.rpc\("record_order_payment"/);
});

test("notificações não registram assinatura nem usam chave VAPID embutida", async () => {
  const push = await read("src/components/PushNotificationManager.tsx");

  assert.doesNotMatch(push, /console\.log/);
  assert.doesNotMatch(push, /subscription\.endpoint\)/);
  assert.match(push, /VITE_VAPID_PUBLIC_KEY/);
  assert.match(push, /push_not_configured/);
});

test("paginação extraída possui navegação acessível", async () => {
  const pagination = await read("src/components/store/CatalogPagination.tsx");

  assert.match(pagination, /aria-label="Paginação do catálogo"/);
  assert.match(pagination, /aria-current=\{isCurrent \? "page"/);
  assert.match(pagination, /Anterior/);
  assert.match(pagination, /Próxima/);
});

test("painel do vendedor pagina pedidos e clientes no servidor", async () => {
  const route = await read("src/routes/_authenticated/vendedor.tsx");
  const orders = await read("src/components/vendedor/OrderManager.tsx");
  const clients = await read("src/components/vendedor/ClientsManager.tsx");
  const notifications = await read("src/components/vendedor/SmartNotifications.tsx");
  const migration = await read(
    "supabase/migrations/20260923004537_seller_server_pagination.sql",
  );

  assert.match(route, /const needsProducts =/);
  assert.match(route, /enabled: !!store && needsProducts/);
  assert.match(route, /enabled: !!store && needsFullWaitlist/);
  assert.match(route, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(route, /waitlistCount=\{alertCounts\.waitlist\}/);
  assert.doesNotMatch(route, /select\("\*, products\(\*\), order_installments\(\*\)"\)/);
  assert.match(orders, /supabase\.rpc\("seller_orders_page"/);
  assert.match(clients, /supabase\.rpc\("seller_clients_page"/);
  assert.match(orders, /PAGE_SIZE_OPTIONS = \[10, 25, 50, 100\]/);
  assert.match(migration, /FUNCTION public\.seller_orders_page/);
  assert.match(migration, /FUNCTION public\.seller_clients_page/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.seller_orders_page[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.seller_clients_page[\s\S]*FROM PUBLIC, anon/);
  assert.doesNotMatch(notifications, /products:/);
  assert.doesNotMatch(notifications, /orders:/);
});
