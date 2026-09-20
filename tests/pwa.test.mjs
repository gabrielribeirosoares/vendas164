import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path, encoding = "utf8") => readFile(new URL(`../${path}`, import.meta.url), encoding);

test("manifesto PWA contém os dados necessários para instalação", async () => {
  const manifest = JSON.parse(await read("public/manifest.webmanifest"));

  assert.equal(manifest.name, "Vendas 1:64");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("shell registra PWA e publica metadados para Android e iOS", async () => {
  const root = await read("src/routes/__root.tsx");

  assert.match(root, /rel: "manifest", href: "\/manifest\.webmanifest"/);
  assert.match(root, /rel: "apple-touch-icon"/);
  assert.match(root, /registerPwa\(\)/);
  assert.match(root, /<PwaInstallPrompt \/>/);
});

test("service worker não armazena páginas autenticadas", async () => {
  const worker = await read("public/sw.js");

  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch\(\(\) => caches\.match\("\/offline\.html"\)\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /cache\.put\(request[\s\S]{0,120}request\.mode === "navigate"/);
});

test("cabeçalho respeita a área segura da barra de status no iOS", async () => {
  const header = await read("src/components/AppHeader.tsx");

  assert.match(header, /pt-\[env\(safe-area-inset-top\)\]/);
  assert.match(header, /sticky top-0/);
});
