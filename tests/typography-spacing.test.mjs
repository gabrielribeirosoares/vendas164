import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stylesPath = new URL("../src/styles.css", import.meta.url);
const buttonPath = new URL("../src/components/ui/button.tsx", import.meta.url);
const inputPath = new URL("../src/components/ui/input.tsx", import.meta.url);
const textareaPath = new URL("../src/components/ui/textarea.tsx", import.meta.url);
const selectPath = new URL("../src/components/ui/select.tsx", import.meta.url);
const cardPath = new URL("../src/components/ui/card.tsx", import.meta.url);
const storefrontPath = new URL("../src/routes/loja.$slug.tsx", import.meta.url);

test("tipografia global mantém ritmo e legibilidade", async () => {
  const source = await readFile(stylesPath, "utf8");

  assert.match(source, /min-width: 320px/);
  assert.match(source, /line-height: 1\.5/);
  assert.match(source, /text-wrap: balance/);
  assert.match(source, /text-wrap: pretty/);
  assert.match(source, /text-size-adjust: 100%/);
});

test("controles têm alvos maiores no celular e foco visível", async () => {
  const [button, input, textarea, select] = await Promise.all([
    readFile(buttonPath, "utf8"),
    readFile(inputPath, "utf8"),
    readFile(textareaPath, "utf8"),
    readFile(selectPath, "utf8"),
  ]);

  assert.match(button, /default: "h-10[\s\S]*md:h-9"/);
  assert.match(button, /icon: "size-10 md:size-9"/);
  assert.match(button, /focus-visible:ring-2/);
  assert.match(input, /h-10 w-full md:h-9/);
  assert.match(input, /focus-visible:ring-offset-2/);
  assert.match(textarea, /min-h-20[\s\S]*md:min-h-\[60px\]/);
  assert.match(select, /h-10 w-full[\s\S]*md:h-9/);
});

test("cards usam espaçamento responsivo sem alterar as duas colunas da vitrine", async () => {
  const [card, storefront] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(storefrontPath, "utf8"),
  ]);

  assert.match(card, /p-4 sm:p-6/);
  assert.match(card, /p-4 pt-0 sm:p-6 sm:pt-0/);
  assert.match(storefront, /grid-cols-2/);
});
