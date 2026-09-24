const STORAGE_SIGNED_MARKER = "/storage/v1/object/sign/store-assets/";
const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/store-assets/";
const OPTIMIZED_PRODUCT_FOLDER = "/optimized-products/";

export function getPublicStorageImageUrl(value: string | null | undefined): string {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.pathname.includes(STORAGE_SIGNED_MARKER)) {
      url.pathname = url.pathname.replace(STORAGE_SIGNED_MARKER, STORAGE_PUBLIC_MARKER);
      url.search = "";
      url.hash = "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function getProductCardImageUrl(value: string | null | undefined): string {
  const publicUrl = getPublicStorageImageUrl(value);
  if (!publicUrl) return "";

  try {
    const url = new URL(publicUrl);
    if (url.pathname.includes(OPTIMIZED_PRODUCT_FOLDER) && /\/main\.(?:webp|jpe?g|png)$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/main\.(webp|jpe?g|png)$/i, "/thumb.$1");
    }
    return url.toString();
  } catch {
    return publicUrl;
  }
}

/** Serve store logos from our public bucket at their display size. */
export function getStoreBrandImageUrl(
  value: string | null | undefined,
  size = 96,
): string {
  if (!value) return "";

  const publicUrl = getPublicStorageImageUrl(value);
  try {
    const url = new URL(publicUrl);
    const marker = "/storage/v1/object/public/store-assets/";
    if (!url.pathname.includes(marker)) return publicUrl;
    url.pathname = url.pathname.replace(marker, "/storage/v1/render/image/public/store-assets/");
    url.search = `?width=${size}&height=${size}&resize=contain&quality=75`;
    url.hash = "";
    return url.toString();
  } catch {
    return publicUrl;
  }
}
