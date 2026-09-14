import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("../src/components/vendedor/OrderManager.tsx", import.meta.url);

test("cards de pedidos organizam valores e controles em telas estreitas", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /Resumo financeiro e edição do sinal/);
  assert.match(source, /Sinal por unidade/);
  assert.match(source, /Salvar sinal/);
  assert.match(source, /inputMode="decimal"/);
  assert.doesNotMatch(source, /grid grid-cols-3 gap-2 rounded-xl bg-muted\/20/);
});

test("status financeiro e envio têm campos separados e alvos maiores", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /Situação financeira e andamento do envio/);
  assert.match(source, />\s*Pagamento\s*<Select/);
  assert.match(source, />\s*Envio\s*<Select/);
  assert.match(source, /Excluir reserva/);
  assert.match(source, /className="mt-1 h-10 w-full text-xs text-foreground"/);
});

test("filtros, rastreio e paginação não comprimem as ações móveis", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /overflow-x-auto/);
  assert.match(source, /placeholder="Código de rastreio"/);
  assert.match(source, /basis-\[180px\]/);
  assert.match(source, />Anterior<\/span>/);
  assert.match(source, />Próxima<\/span>/);
  assert.match(source, /sm:hidden">Importar/);
  assert.match(source, /sm:hidden">Exportar/);
});
