import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("upload otimiza imagens e usa URL pública com cache longo", async () => {
  const upload = await read("src/lib/upload.ts");
  const optimization = await read("src/lib/imageOptimization.ts");

  assert.match(upload, /optimizeImage\(file, preset\)/);
  assert.match(upload, /cacheControl: String\(YEAR\)/);
  assert.match(upload, /contentType: optimized\.main\.type/);
  assert.match(upload, /imageExtension\(optimized\.main\)/);
  assert.match(upload, /getPublicUrl\(mainPath\)/);
  assert.doesNotMatch(upload, /createSignedUrl/);
  assert.match(optimization, /MAX_SOURCE_BYTES = 12 \* 1024 \* 1024/);
  assert.match(optimization, /maxWidth: 480, maxHeight: 360/);
  assert.match(optimization, /maxBytes: 90 \* 1024/);
  assert.match(optimization, /canvasToBlob\(canvas, "image\/webp"/);
  assert.match(optimization, /fallbackType: "image\/jpeg"/);
  assert.match(optimization, /fallbackType: "image\/png"/);
});

test("cards usam a miniatura dos novos uploads", async () => {
  const urls = await read("src/lib/imageUrls.ts");
  const card = await read("src/components/store/StoreProductCard.tsx");
  const marquee = await read("src/components/store/BrandMiniaturesMarquee.tsx");

  assert.match(urls, /optimized-products/);
  assert.match(urls, /webp\|jpe\?g\|png/);
  assert.match(urls, /"\/thumb\.\$1"/);
  assert.match(urls, /storage\/v1\/object\/public\/store-assets/);
  assert.match(card, /getProductCardImageUrl\(product\.image_url\)/);
  assert.match(marquee, /getProductCardImageUrl\(item\.image_url\)/);
});
