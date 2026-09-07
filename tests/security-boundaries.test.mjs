import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('tracking credentials stay on the authenticated server boundary', async () => {
  const [client, route] = await Promise.all([
    read('src/lib/trackingService.ts'),
    read('src/routes/api/tracking.ts'),
  ]);

  assert.doesNotMatch(client, /eyJ[A-Za-z0-9_-]{20,}\./);
  assert.doesNotMatch(client, /localStorage\.setItem\([^\n]*melhor_envio_token/);
  assert.doesNotMatch(client, /[?&]token=/);
  assert.doesNotMatch(route, /searchParams\.get\(["']token["']\)/);
  assert.doesNotMatch(route, /x-melhor-envio-token/i);
  assert.match(route, /process\.env\.MELHOR_ENVIO_TOKEN/);
  assert.match(route, /request\.headers\.get\(["']authorization["']\)/);
  assert.match(route, /\.eq\(["']owner_id["'], userId\)/);
});

test('admin authorization failures remain visible and retryable', async () => {
  const sellerRoute = await read('src/routes/_authenticated/vendedor.tsx');

  assert.match(sellerRoute, /isError: isAdminCheckError/);
  assert.match(sellerRoute, /refetch: retryAdminCheck/);
  assert.match(sellerRoute, /Não foi possível verificar suas permissões administrativas/);
  assert.match(sellerRoute, /Tentar novamente/);
});
