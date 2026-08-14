// Helper module for Store Announcement Banner and Product Custom Badges

export function getStoreBanner(storeId: string): string {
  if (!storeId) return "";
  try {
    return localStorage.getItem(`minipre_store_banner_${storeId}`) || "";
  } catch (e) {
    return "";
  }
}

export function saveStoreBanner(storeId: string, bannerText: string) {
  if (!storeId) return;
  try {
    localStorage.setItem(`minipre_store_banner_${storeId}`, bannerText.trim());
  } catch (e) {
    // ignore
  }
}

export function getProductBadge(productId: string): string {
  if (!productId) return "";
  try {
    return localStorage.getItem(`minipre_product_badge_${productId}`) || "";
  } catch (e) {
    return "";
  }
}

export function saveProductBadge(productId: string, badge: string) {
  if (!productId) return;
  try {
    if (!badge) {
      localStorage.removeItem(`minipre_product_badge_${productId}`);
    } else {
      localStorage.setItem(`minipre_product_badge_${productId}`, badge);
    }
  } catch (e) {
    // ignore
  }
}

export const PRESET_BADGES = [
  { label: "Nenhum", value: "" },
  { label: "🔥 Lançamento", value: "Lançamento" },
  { label: "⭐ Edição Limitada", value: "Edição Limitada" },
  { label: "💎 Destaque", value: "Destaque" },
  { label: "🏆 Exclusivo", value: "Exclusivo" },
  { label: "✈️ Chegada em Breve", value: "Chegada em Breve" },
];
