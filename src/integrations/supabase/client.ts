// Custom Supabase Client with Subdomain Cookie Session Persistence
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Returns the parent domain for setting cookies across all subdomains.
 * e.g. ".vendas164.com.br" or ".localhost"
 */
function getCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const hostname = window.location.hostname.toLowerCase();

  if (hostname.endsWith(".vendas164.com.br") || hostname === "vendas164.com.br") {
    return ".vendas164.com.br";
  }

  if (hostname.endsWith(".localhost") || hostname === "localhost") {
    return ".localhost";
  }

  if (hostname.endsWith(".vercel.app")) {
    const parts = hostname.split(".");
    if (parts.length >= 4) {
      return "." + parts.slice(1).join(".");
    }
    return "." + hostname;
  }

  return undefined;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const nameEQ = encodeURIComponent(name) + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length));
    }
  }
  return null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    expires = "; expires=" + date.toUTCString();
  }
  const domain = getCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : "";
  const secureAttr = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}${expires}; path=/${domainAttr}${secureAttr}; SameSite=Lax`;
}

function removeCookie(name: string) {
  if (typeof document === "undefined") return;
  const domain = getCookieDomain();
  const domainAttr = domain ? `; domain=${domain}` : "";
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainAttr}`;
}

/**
 * Storage adapter that persists Supabase Auth session tokens in a domain-wide Cookie.
 * This allows seamless single sign-on (SSO) across all store subdomains.
 */
const subdomainCookieStorage = {
  getItem: (key: string): string | null => {
    // 1. Check domain cookie
    const cookieVal = getCookie(key);
    if (cookieVal) return cookieVal;

    // 2. Fallback to localStorage and migrate to domain cookie if present
    if (typeof localStorage !== "undefined") {
      try {
        const localVal = localStorage.getItem(key);
        if (localVal) {
          setCookie(key, localVal);
          return localVal;
        }
      } catch {}
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    setCookie(key, value);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(key, value);
      } catch {}
    }
  },
  removeItem: (key: string): void => {
    removeCookie(key);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  },
};

function createSupabaseClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Connect Supabase in Lovable Cloud.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: typeof window !== 'undefined' ? subdomainCookieStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
