const STORAGE_SIGNED_MARKER = "/storage/v1/object/sign/store-assets/";
const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/store-assets/";
const OPTIMIZED_PRODUCT_FOLDER = "/optimized-products/";

/**
 * Extracts an array of valid image URLs from a stored product image_url field.
 * Supports legacy single URL strings, newline-separated URLs, and JSON array strings.
 */
export function getProductImageUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean);
      }
    } catch {}
  }

  if (trimmed.includes("\n")) {
    return trimmed
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

export function getPublicStorageImageUrl(value: string | null | undefined): string {
  if (!value) return "";
  const rawFirst = getProductImageUrls(value)[0] || value;

  try {
    const url = new URL(rawFirst);
    if (url.pathname.includes(STORAGE_SIGNED_MARKER)) {
      url.pathname = url.pathname.replace(STORAGE_SIGNED_MARKER, STORAGE_PUBLIC_MARKER);
      url.search = "";
      url.hash = "";
    }
    return url.toString();
  } catch {
    return rawFirst;
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
