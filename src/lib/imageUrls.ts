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
    if (url.pathname.includes(OPTIMIZED_PRODUCT_FOLDER) && url.pathname.endsWith("/main.webp")) {
      url.pathname = url.pathname.replace(/\/main\.webp$/, "/thumb.webp");
    }
    return url.toString();
  } catch {
    return publicUrl;
  }
}
