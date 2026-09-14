import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cart = await readFile(new URL("../src/components/CartDrawer.tsx", import.meta.url), "utf8");

test("cart groups items and totals by store", () => {
  assert.match(cart, /const storeItems = cart\.getItemsByStore\(storeId\)/);
  assert.match(cart, /Subtotal da loja/);
  assert.match(cart, /storeItems\.reduce/);
});

test("cart controls are touch friendly and clear stale errors", () => {
  assert.match(cart, /className="size-11 rounded-xl"/);
  assert.match(cart, /setErrorMessage\(''\)/);
  assert.match(cart, /aria-label={`Diminuir quantidade/);
  assert.match(cart, /aria-label={`Aumentar quantidade/);
});

test("clearing the cart requires confirmation", () => {
  assert.match(cart, /<AlertDialog>/);
  assert.match(cart, /Limpar todo o carrinho\?/);
  assert.match(cart, /Remover tudo/);
});

test("checkout summary remains outside the scrolling item list", () => {
  assert.match(cart, /shrink-0 space-y-3 border-t/);
  assert.match(cart, /Sinal a pagar/);
  assert.match(cart, /Saldo restante/);
  assert.doesNotMatch(cart, /const unitCount = unitCount/);
});

test("persisted cart items can change quantity after reopening", () => {
  assert.match(cart, /refreshPrices\({ silent: true }\)/);
  assert.doesNotMatch(cart, /item\.quantity <= 1 \|\| !item\.pricingProduct/);
  assert.doesNotMatch(cart, /busy \|\| !item\.pricingProduct \|\| item\.quantity/);
  assert.match(cart, /Math\.min\(100, item\.pricingProduct\?\.stock \?\? 100\)/);
});
