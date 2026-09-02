import { useState, useEffect } from "react";

/**
 * Detects if the current request or hostname belongs to a store subdomain.
 * Examples:
 * - gabrielminis.vendas164.com.br -> "gabrielminis"
 * - gabrielminis.localhost:5173 -> "gabrielminis"
 * - localhost:5173?store=gabrielminis -> "gabrielminis" (testing override)
 * - vendas164.com.br -> null (main platform)
 * - www.vendas164.com.br -> null (main platform)
 */
export function getSubdomain(hostname?: string): string | null {
  if (typeof window === "undefined" && !hostname) return null;

  // Query parameter override for easy testing in development/preview:
  // e.g. http://localhost:8080/?store=gabriel-minis or ?subdomain=gabriel-minis
  if (typeof window !== "undefined") {
    const searchParams = new URLSearchParams(window.location.search);
    const paramStore = searchParams.get("store") || searchParams.get("subdomain");
    if (paramStore && paramStore.trim()) {
      return paramStore.trim().toLowerCase();
    }
  }

  const host = (hostname || (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;

  // Handle *.localhost for local testing (e.g. gabriel-minis.localhost)
  if (host.endsWith(".localhost")) {
    const parts = host.split(".");
    if (parts.length > 1 && parts[0] !== "www") {
      return parts[0];
    }
    return null;
  }

  const parts = host.split(".");

  // Handle multi-level TLDs (e.g. vendas164.com.br)
  if (host.endsWith(".com.br") || host.endsWith(".com.au") || host.endsWith(".co.uk")) {
    if (parts.length > 3 && parts[0] !== "www") {
      return parts[0];
    }
    return null;
  }

  // Handle standard TLDs (e.g. store.domain.com)
  if (parts.length > 2 && parts[0] !== "www") {
    // Ignore default Vercel preview domains unless subdomain prefix exists
    if (host.endsWith(".vercel.app") && parts.length <= 3) {
      return null;
    }
    return parts[0];
  }

  return null;
}

/**
 * Builds the appropriate full store URL based on the current environment.
 * If user is currently logged in, appends session tokens in URL hash to seamlessly
 * hand off the active session across subdomains and localhost without logging out.
 *
 * Examples:
 * - In local dev: http://zero51-garage.localhost:8080
 * - In production: https://zero51-garage.vendas164.com.br
 */
export function getStoreFullUrl(slug: string): string {
  if (!slug) return "/";

  if (typeof window === "undefined") {
    return `https://www.vendas164.com.br/loja/${slug}`;
  }

  const hostname = window.location.hostname.toLowerCase();
  const port = window.location.port ? `:${window.location.port}` : "";
  const protocol = window.location.protocol;

  // Local testing with localhost
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")) {
    return `${protocol}//localhost${port}/loja/${slug}`;
  } else if (hostname.endsWith("vendas164.com.br")) {
    return `https://www.vendas164.com.br/loja/${slug}`;
  }

  return `${window.location.origin}/loja/${slug}`;
}

/**
 * Returns user-friendly domain text representation for display.
 * e.g. "vendas164.com.br/loja/teste"
 */
export function getStoreDisplayDomain(slug: string): string {
  if (!slug) return "";
  return `vendas164.com.br/loja/${slug}`;
}

/**
 * Returns the correct product URL based on context:
 * - On a subdomain (zero51-garage.localhost): "/produto/1964-chevrolet"  (clean URL)
 * - On main domain (localhost / vendas164.com.br): "/loja/zero51-garage/1964-chevrolet"
 */
export function getProductUrl(storeSlug: string, itemSlug: string): string {
  if (typeof window === "undefined") {
    return `/loja/${storeSlug}/${itemSlug}`;
  }
  const currentSub = getSubdomain();
  // If we're already on the correct store's subdomain, use the clean /produto/ path
  if (currentSub && currentSub === storeSlug) {
    return `/produto/${itemSlug}`;
  }
  return `/loja/${storeSlug}/${itemSlug}`;
}

export function useSubdomain() {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setSubdomain(getSubdomain());
    setIsMounted(true);
  }, []);

  return {
    subdomain: isMounted ? subdomain : null,
    isSubdomain: isMounted && !!subdomain,
    isMounted,
  };
}

/**
 * Returns the base URL of the main platform (no subdomain).
 * e.g. "http://localhost:8080" or "https://vendas164.com.br"
 */
export function getMainPlatformUrl(path: string = ""): string {
  if (typeof window === "undefined") {
    return `https://vendas164.com.br${path}`;
  }

  const hostname = window.location.hostname.toLowerCase();
  const port = window.location.port ? `:${window.location.port}` : "";
  const protocol = window.location.protocol;

  // If on a *.localhost subdomain, strip the subdomain
  if (hostname.endsWith(".localhost")) {
    return `${protocol}//localhost${port}${path}`;
  } else if (hostname.endsWith(".vendas164.com.br") && hostname !== "vendas164.com.br") {
    return `https://vendas164.com.br${path}`;
  } else if (hostname.endsWith(".vercel.app")) {
    const baseVercelHost = hostname.split(".").slice(-3).join(".");
    return `${protocol}//${baseVercelHost}${port}${path}`;
  }

  return `${window.location.origin}${path}`;
}

/**
 * If the current page is running on a store subdomain but is a
 * platform-level route (e.g. /vendedor, /painel, /auth),
 * redirects to the main domain automatically.
 */
export function redirectToMainIfOnSubdomain(path?: string): boolean {
  if (typeof window === "undefined") return false;
  const subdomain = getSubdomain();
  if (!subdomain) return false;

  const targetPath = path || window.location.pathname + window.location.search;
  const mainUrl = getMainPlatformUrl(targetPath);

  if (mainUrl !== window.location.href) {
    window.location.replace(mainUrl);
    return true;
  }
  return false;
}
