import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const statePath = new URL("../src/components/InterfaceState.tsx", import.meta.url);
const storePath = new URL("../src/routes/loja.$slug.tsx", import.meta.url);
const panelPath = new URL("../src/routes/_authenticated/painel.tsx", import.meta.url);
const productPath = new URL("../src/components/vendedor/ProductManager.tsx", import.meta.url);

test("estado reutilizável diferencia vazio, erro e sucesso", async () => {
  const source = await readFile(statePath, "utf8");

  assert.match(source, /type FeedbackVariant = "empty" \| "error" \| "success"/);
  assert.match(source, /role=\{variant === "error" \? "alert" : "status"\}/);
  assert.match(source, /aria-live=\{variant === "error" \? "assertive" : "polite"\}/);
  assert.match(source, /action\?: ReactNode/);
});

test("vitrine apresenta carregamento, ausência e filtros de forma acionável", async () => {
  const source = await readFile(storePath, "utf8");

  assert.match(source, /aria-label="Carregando catálogo"/);
  assert.match(source, /title="Loja não encontrada"/);
  assert.match(source, /Limpar todos os filtros/);
  assert.match(source, /<InterfaceState/);
});

test("painel do cliente oferece recuperação nos erros", async () => {
  const source = await readFile(panelPath, "utf8");

  assert.match(source, /aria-label="Carregando suas reservas"/);
  assert.match(source, /title="Não foi possível carregar as reservas"/);
  assert.match(source, /title="Não foi possível carregar a fila"/);
  assert.match(source, /onClick=\{\(\) => ordersQuery\.refetch\(\)\}/);
  assert.match(source, /onClick=\{\(\) => waitlistQuery\.refetch\(\)\}/);
});

test("catálogo do vendedor orienta cadastro ou limpeza dos filtros", async () => {
  const source = await readFile(productPath, "utf8");

  assert.match(source, /Nenhuma miniatura corresponde aos filtros/);
  assert.match(source, /Limpar filtros/);
  assert.match(source, /Cadastrar pré-venda/);
});
