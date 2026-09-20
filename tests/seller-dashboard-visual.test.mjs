import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = new URL("../src/routes/_authenticated/vendedor.tsx", import.meta.url);
const headerPath = new URL("../src/components/vendedor/SellerSectionHeader.tsx", import.meta.url);
const overviewPath = new URL("../src/components/vendedor/SellerOverview.tsx", import.meta.url);

test("painel identifica a seção ativa e separa grupos da navegação", async () => {
  const [route, header] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(headerPath, "utf8"),
  ]);

  assert.match(route, /<SellerSectionHeader activeSection=\{activeTab\} storeName=\{store\.name\}/);
  assert.match(route, />\s*Operação\s*</);
  assert.match(route, />\s*Configuração\s*</);
  assert.match(header, /Seção atual/);
  assert.match(header, /Reservas e pedidos/);
  assert.match(header, /Personalização da loja/);
});

test("indicadores permanecem compactos e legíveis no celular", async () => {
  const overview = await readFile(overviewPath, "utf8");

  assert.match(overview, /grid grid-cols-2/);
  assert.match(overview, /tabular-nums/);
  assert.match(overview, /break-words/);
  assert.doesNotMatch(overview, /md:grid-cols-2 gap-4/);
});

test("painel inteiro herda a cor configurada pela loja", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /"--primary": storeThemeColor/);
  assert.match(route, /"--primary-foreground": getReadableTextColor\(storeThemeColor\)/);
  assert.match(route, /style=\{storeThemeStyle\}/);
  assert.doesNotMatch(route, /border-amber-500\/30 text-amber-600 hover:text-amber-500/);
});
