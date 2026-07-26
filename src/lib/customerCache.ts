export interface CachedCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

const CACHE_KEY = "minipre_customer_profiles_cache_v1";

export function getAllCustomerCache(): Record<string, CachedCustomer> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getCustomerFromCache(id: string): CachedCustomer | null {
  const cache = getAllCustomerCache();
  return cache[id] || null;
}

export function saveCustomerToCache(customer: CachedCustomer) {
  if (!customer || !customer.id) return;
  try {
    const cache = getAllCustomerCache();
    const existing = cache[customer.id] || {};
    
    const updated: CachedCustomer = {
      id: customer.id,
      name: customer.name || existing.name || null,
      email: customer.email || existing.email || null,
      phone: customer.phone || existing.phone || null,
    };

    cache[customer.id] = updated;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error("Erro ao salvar cache de cliente:", err);
  }
}
