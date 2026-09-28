import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Bling import prefers the original external product image", async () => {
  const [server, client, dialog] = await Promise.all([
    readFile(new URL("../src/lib/bling.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/bling.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/vendedor/BlingIntegrationDialog.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(server, /produtos\/\$\{productId\}/);
  assert.match(server, /imagens\?\.externas/);
  assert.match(server, /imageQuality: 'original'/);
  assert.match(server, /linkMiniatura/);
  assert.match(client, /fetchBlingProductImageServer/);
  assert.match(dialog, /image\.imageQuality === "thumbnail"/);
  assert.match(dialog, /só possuem miniatura no Bling/);
});
