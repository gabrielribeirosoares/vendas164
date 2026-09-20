import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../src/routes/loja.$slug.tsx", import.meta.url), "utf8");
const card = await readFile(new URL("../src/components/store/StoreProductCard.tsx", import.meta.url), "utf8");

test("store grid keeps two columns on mobile and uses the shared card", () => {
  assert.match(route, /grid grid-cols-2 gap-3/);
  assert.match(route, /<StoreProductCard/);
  assert.match(route, /onAdd={handleQuickAdd}/);
});

test("store card keeps readable labels and separate interactive elements", () => {
  assert.match(card, /text-xs/);
  assert.match(card, /min-h-11/);
  assert.match(card, /aria-label=/);
  assert.doesNotMatch(card, /text-\[(?:9|10|11)px\]/);
  assert.doesNotMatch(route, /<a\s+key={p.id}[\s\S]{0,120}<Card/);
});

test("store card exposes the key purchase information", () => {
  assert.match(card, /À vista/);
  assert.match(card, /Sinal:/);
  assert.match(card, /unidades disponíveis|formatStoreProductCardStock/);
  assert.match(card, /getProductInstallmentInfo/);
});

test("stock helper defines Zero51 Garage default threshold of 5 units", async () => {
  const stockLib = await readFile(new URL("../src/lib/stock.ts", import.meta.url), "utf8");
  assert.match(stockLib, /b2d3e709-3d0c-4dc1-be97-6c92b961f210/);
  assert.match(stockLib, /Disponível/);
});

test("store actions follow the configured theme instead of device-local tab colors", async () => {
  const [customizations, settings, products, itemRoute] = await Promise.all([
    readFile(new URL("../src/lib/storeCustomizations.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/vendedor/StoreSettings.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/vendedor/ProductManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/loja.$slug.$itemSlug.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(customizations, /minipre_store_tab_colors_/);
  assert.doesNotMatch(settings, /Cores dos Botões das Abas e Painel/);
  assert.match(products, /const activeColor = store\.primary_color/);
  assert.match(itemRoute, /const themeColor = product\?\.stores\?\.primary_color/);
  assert.match(customizations, /getReadableTextColor/);
});
