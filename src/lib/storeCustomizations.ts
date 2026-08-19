// Helper module for Store Announcement Banner, Product Custom Badges, and Store Reviews

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

export function getProductCategory(productId: string): "pre_venda" | "pronta_entrega" {
  if (!productId) return "pre_venda";
  try {
    const val = localStorage.getItem(`minipre_product_category_${productId}`);
    if (val === "pronta_entrega") return "pronta_entrega";
  } catch (e) {
    // ignore
  }
  return "pre_venda";
}

export function saveProductCategory(productId: string, category: "pre_venda" | "pronta_entrega") {
  if (!productId) return;
  try {
    localStorage.setItem(`minipre_product_category_${productId}`, category);
  } catch (e) {
    // ignore
  }
}

export const PRESET_BADGES = [
  { label: "Nenhum", value: "" },
  { label: "⚡ Pronta Entrega", value: "Pronta Entrega" },
  { label: "🔥 Lançamento", value: "Lançamento" },
  { label: "⭐ Edição Limitada", value: "Edição Limitada" },
  { label: "💎 Destaque", value: "Destaque" },
  { label: "🏆 Exclusivo", value: "Exclusivo" },
  { label: "✈️ Chegada em Breve", value: "Chegada em Breve" },
];

export interface StoreReview {
  id: string;
  author_name: string;
  rating: number; // 1 to 5
  comment: string;
  created_at: string;
  verified_purchase?: boolean;
}

export const DEFAULT_STORE_REVIEWS: StoreReview[] = [];

import { supabase } from "@/integrations/supabase/client";

export function getStoreReviews(storeId: string): StoreReview[] {
  if (!storeId) return [];
  try {
    const stored = localStorage.getItem(`minipre_store_reviews_${storeId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // ignore
  }
  return [];
}

export function saveStoreReviews(storeId: string, reviews: StoreReview[]) {
  if (!storeId) return;
  try {
    localStorage.setItem(`minipre_store_reviews_${storeId}`, JSON.stringify(reviews));
  } catch (e) {
    // ignore
  }
}

export function addStoreReview(storeId: string, review: Omit<StoreReview, "id" | "created_at">) {
  const current = getStoreReviews(storeId);
  const newReview: StoreReview = {
    ...review,
    id: `rev-${Date.now()}`,
    created_at: "Hoje",
    verified_purchase: true,
  };
  const updated = [newReview, ...current];
  saveStoreReviews(storeId, updated);
  return updated;
}

export async function fetchStoreReviewsFromSupabase(storeId: string): Promise<StoreReview[]> {
  if (!storeId) return getStoreReviews(storeId);
  try {
    const { data, error } = await supabase
      .from("store_reviews" as any)
      .select("*")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const formatted: StoreReview[] = data.map((r: any) => ({
        id: r.id || `rev-${Math.random()}`,
        author_name: r.author_name || r.name || "Cliente",
        rating: Number(r.rating || 5),
        comment: r.comment || r.content || "",
        created_at: r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "Recente",
        verified_purchase: true,
      }));
      if (formatted.length > 0) {
        saveStoreReviews(storeId, formatted);
        return formatted;
      }
    }
  } catch (e) {
    // Fallback to local storage if table doesn't exist yet
  }
  return getStoreReviews(storeId);
}

export async function saveStoreReviewToSupabase(storeId: string, review: Omit<StoreReview, "id" | "created_at">) {
  const localUpdated = addStoreReview(storeId, review);
  try {
    await supabase.from("store_reviews" as any).insert({
      store_id: storeId,
      author_name: review.author_name,
      rating: review.rating,
      comment: review.comment,
    });
  } catch (e) {
    // Fallback silently if table does not exist
  }
  return localUpdated;
}
