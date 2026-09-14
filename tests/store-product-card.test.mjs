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
  assert.doesNotMatch(card, /<a[^>]*>[\s\S]*<Button[\s\S]*<\/a>/);
});

test("store card exposes the key purchase information", () => {
  assert.match(card, /À vista/);
  assert.match(card, /Sinal:/);
  assert.match(card, /unidades disponíveis/);
  assert.match(card, /getProductInstallmentInfo/);
});
