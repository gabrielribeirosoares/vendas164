export const DEFAULT_PRESET_BRANDS = [
  "Hot Wheels",
  "Mini GT",
  "Kaido House",
  "Inno64",
  "Tarmac Works",
  "Matchbox",
  "Greenlight",
  "Pop Race",
  "Tomica",
  "Autoart",
  "Solido",
  "BBR",
  "Spark",
  "Majorette",
  "M2 Machines",
  "Johnny Lightning",
  "Jada Toys",
  "Para64",
  "GCD",
  "Hobby Japan",
  "Outros",
];

export function getStoreBrands(storeId: string): string[] {
  if (!storeId) return DEFAULT_PRESET_BRANDS;
  try {
    const stored = localStorage.getItem(`minipre_store_brands_${storeId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // Ignore storage error
  }
  return DEFAULT_PRESET_BRANDS;
}

export function saveStoreBrands(storeId: string, brands: string[]) {
  if (!storeId) return;
  try {
    localStorage.setItem(`minipre_store_brands_${storeId}`, JSON.stringify(brands));
  } catch (e) {
    // Ignore storage error
  }
}
