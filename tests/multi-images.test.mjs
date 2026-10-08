import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("imageUrls.ts exports getProductImageUrls and supports multi-image extraction", async () => {
  const source = await read("src/lib/imageUrls.ts");

  assert.match(source, /export function getProductImageUrls/);
  assert.match(source, /JSON\.parse/);
  assert.match(source, /split\(/);
  assert.match(source, /getProductImageUrls\(value\)\[0\]/);
});

test("ProductPhotosInput component supports up to 8 photos, cover selection, and reordering", async () => {
  const source = await read("src/components/vendedor/ProductPhotosInput.tsx");

  assert.match(source, /maxImages = 8/);
  assert.match(source, /uploadImage\(userId, filesToUpload\[i\], "product"\)/);
  assert.match(source, /handleSetCover/);
  assert.match(source, /handleRemove/);
  assert.match(source, /handleMove/);
  assert.match(source, /Definir Capa/);
  assert.match(source, /multiple/);
});

test("ProductManager uses ProductPhotosInput for both new products and editing", async () => {
  const source = await read("src/components/vendedor/ProductManager.tsx");

  assert.match(source, /import \{ ProductPhotosInput \} from "\.\/ProductPhotosInput"/);
  assert.match(source, /<ProductPhotosInput[\s\S]*images=\{getProductImageUrls\(form\.image_url\)\}/);
});

test("Product detail page features interactive multi-photo gallery and thumbnails", async () => {
  const source = await read("src/routes/loja.$slug.$itemSlug.tsx");

  assert.match(source, /getProductImageUrls\(selectedVariant\?\.image_url \|\| product\?\.image_url\)/);
  assert.match(source, /selectedImageIndex/);
  assert.match(source, /object-contain p-3 sm:p-5/);
  assert.match(source, /Foto anterior/);
  assert.match(source, /Próxima foto/);
});
