import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("vitrine publica a logo personalizada na prévia social", async () => {
  const storeRoute = await read("src/routes/loja.$slug.tsx");

  assert.match(storeRoute, /optimizeImageUrl\(store\?\.logo_url\)/);
  assert.match(storeRoute, /optimizedLogo \|\| optimizedFavicon/);
  assert.match(storeRoute, /property: "og:image", content: img/);
  assert.match(storeRoute, /name: "twitter:image", content: img/);
});

test("links copiados mudam de versão quando a logo da loja muda", async () => {
  const helper = await read("src/lib/subdomain.ts");
  const storeRoute = await read("src/routes/loja.$slug.tsx");
  const sellerRoute = await read("src/routes/_authenticated/vendedor.tsx");

  assert.match(helper, /export function withStorePreviewVersion/);
  assert.match(helper, /preview=\$\{/);
  assert.match(storeRoute, /withStorePreviewVersion\(/);
  assert.match(storeRoute, /getStoreFullUrl\(slug\)/);
  assert.match(storeRoute, /data\.store\.logo_url \|\| data\.store\.favicon_url/);
  assert.match(sellerRoute, /withStorePreviewVersion\(/);
  assert.match(sellerRoute, /store\.logo_url \|\| store\.favicon_url/);
});
