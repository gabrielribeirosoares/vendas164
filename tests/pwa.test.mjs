import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path, encoding = "utf8") => readFile(new URL(`../${path}`, import.meta.url), encoding);
const readBinary = (path) => readFile(new URL(`../${path}`, import.meta.url));

async function readPngDimensions(path) {
  const image = await readBinary(path);
  assert.equal(image.toString("ascii", 1, 4), "PNG", `${path} deve ser um PNG`);
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

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
  assert.match(root, /href: "\/favicon\.ico"/);
  assert.match(root, /href: "\/icons\/favicon-32\.png"/);
  assert.match(root, /rel: "apple-touch-icon", sizes: "180x180", href: "\/icons\/apple-touch-icon-180\.png"/);
  assert.match(root, /registerPwa\(\)/);
  assert.match(root, /<PwaInstallPrompt \/>/);
});

test("ícones derivados da identidade possuem os tamanhos esperados", async () => {
  const expectedSizes = [
    ["public/icons/pwa-icon-192.png", 192],
    ["public/icons/pwa-icon-512.png", 512],
    ["public/icons/pwa-icon-maskable-512.png", 512],
    ["public/icons/apple-touch-icon-180.png", 180],
    ["public/icons/favicon-32.png", 32],
    ["public/icons/vendas164-default.png", 512],
  ];

  for (const [path, size] of expectedSizes) {
    assert.deepEqual(await readPngDimensions(path), [size, size]);
  }
});

test("cabeçalho usa a identidade padrão quando a loja não possui logo", async () => {
  const header = await read("src/components/AppHeader.tsx");
  const occurrences = header.match(/src="\/icons\/vendas164-default\.png"/g) ?? [];

  assert.equal(occurrences.length, 2);
  assert.match(header, /updateAppFavicon\(icon\)/);
});

test("favicon dinâmico volta ao ícone padrão fora de uma loja personalizada", async () => {
  const favicon = await read("src/lib/favicon.ts");

  assert.match(favicon, /DEFAULT_APP_FAVICON = "\/icons\/favicon-32\.png"/);
  assert.match(favicon, /iconUrl \|\| DEFAULT_APP_FAVICON/);
});

test("service worker não armazena páginas autenticadas", async () => {
  const worker = await read("public/sw.js");

  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch\(\(\) => caches\.match\("\/offline\.html"\)\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(worker, /cache\.put\(request[\s\S]{0,120}request\.mode === "navigate"/);
});

test("service worker mantém cache local limitado para imagens do Supabase", async () => {
  const worker = await read("public/sw.js");

  assert.match(worker, /IMAGE_CACHE_NAME = "vendas164-images-v1"/);
  assert.match(worker, /request\.destination === "image"/);
  assert.match(worker, /url\.hostname\.endsWith\("\.supabase\.co"\)/);
  assert.match(worker, /IMAGE_CACHE_LIMIT = 300/);
  assert.match(worker, /cache\.match\(request\)/);
});

test("cabeçalho respeita a área segura da barra de status no iOS", async () => {
  const header = await read("src/components/AppHeader.tsx");

  assert.match(header, /pt-\[env\(safe-area-inset-top\)\]/);
  assert.match(header, /sticky top-0/);
});
