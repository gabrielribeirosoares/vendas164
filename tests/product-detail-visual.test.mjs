import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/routes/loja.$slug.$itemSlug.tsx", import.meta.url), "utf8");

test("product image is displayed without cropping", () => {
  assert.match(page, /object-contain p-3 sm:p-5/);
  assert.doesNotMatch(page, /h-full w-full object-cover/);
});

test("purchase controls remain readable and touch friendly", () => {
  assert.match(page, /aria-label="Diminuir quantidade"/);
  assert.match(page, /aria-label="Aumentar quantidade"/);
  assert.match(page, /h-11 w-11 rounded-lg/);
  assert.doesNotMatch(page, /text-\[(?:10|11)px\]/);
});

test("order summary and mobile action remain visible", () => {
  assert.match(page, /Resumo do pedido sempre visível/);
  assert.match(page, /Sinal para reservar/);
  assert.match(page, /Saldo na chegada/);
  assert.match(page, /sticky bottom-2/);
});

test("product description has a dedicated readable section", () => {
  assert.match(page, /Sobre a miniatura/);
  assert.match(page, /whitespace-pre-line text-sm leading-6/);
});

test("displays continuous same-brand miniatures marquee below product view", () => {
  assert.match(page, /BrandMiniaturesMarquee/);
});

