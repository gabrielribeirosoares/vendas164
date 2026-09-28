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
  assert.match(server, /image\.link/);
  assert.match(server, /orgbling\.s3\.amazonaws\.com/);
  assert.match(server, /Buffer\.from\(bytes\)\.toString\('base64'\)/);
  assert.match(server, /MAX_BLING_IMAGE_BYTES/);
  assert.match(client, /fetchBlingProductImageServer/);
  assert.match(dialog, /imageQuality = image\.imageQuality/);
  assert.match(dialog, /persistResolvedBlingImage/);
  assert.match(dialog, /base64ToImageFile/);
  assert.match(dialog, /uploadImage\(data\.user\.id, file, "product"\)/);
  assert.match(dialog, /imageQuality !== "original"/);
  assert.match(dialog, /Corrigir imagens importadas/);
  assert.match(dialog, /retryBlingImage/);
  assert.match(dialog, /uploadReplacement/);
  assert.match(dialog, /saveReplacementUrl/);
});
