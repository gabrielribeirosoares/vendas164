import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Bling OAuth returns automatically without copy and paste", async () => {
  const [server, dialog, callback] = await Promise.all([
    readFile(new URL("../src/lib/bling.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/vendedor/BlingIntegrationDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/api/bling/oauth/callback.ts", import.meta.url), "utf8"),
  ]);

  assert.match(server, /process\.env\.BLING_CLIENT_ID/);
  assert.match(server, /\.eq\('oauth_state', state\)/);
  assert.match(server, /'enable-jwt': '1'/);
  assert.match(callback, /finishConnection\(request\.url\)/);
  assert.match(callback, /bling=connected/);
  assert.match(dialog, /window\.location\.assign\(result\.url\)/);
  assert.doesNotMatch(dialog, /Cole o link completo retornado pelo Bling/);
  assert.doesNotMatch(dialog, /authCodeInput|exchangeBlingCodeServer/);
});
