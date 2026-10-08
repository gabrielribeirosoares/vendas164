import type { Json } from "@/integrations/supabase/types";

export interface ColorVariant {
  id: string;
  name: string;
  stock: number;
  image_url: string | null;
  color?: string;
  size?: string;
  brake?: string;
  price?: number | null;
}
export function getColorVariants(
  product: { color_variants?: Json } | null | undefined,
): ColorVariant[] {
  if (!Array.isArray(product?.color_variants)) return [];
  return (
    product.color_variants.filter(
      (v) =>
        !!v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        Number.isInteger(v.stock) &&
        Number(v.stock) >= 0,
    ) as unknown as ColorVariant[]
  ).map((v) => ({ ...v, color: v.color ?? v.name }));
}
export function variantsToJson(variants: ColorVariant[]): Json {
  return variants.map((v) => ({ ...v, name: getVariantLabel(v) }));
}
export function validateVariants(variants: ColorVariant[]) {
  if (
    variants.length > 40 ||
    variants.some(
      (v) =>
        !getVariantLabel(v) ||
        Object.values(getVariantAttributes(v)).some((a) => a.length > 60) ||
        !["", "Com freio", "Sem freio"].includes(v.brake ?? "") ||
        getVariantLabel(v).length > 180 ||
        !Number.isInteger(v.stock) ||
        v.stock < 0 ||
        v.stock > 999999 ||
        (v.price != null &&
          (!Number.isFinite(v.price) ||
            v.price < 0 ||
            v.price > 1000000 ||
            Math.abs(v.price * 100 - Math.round(v.price * 100)) > 0.000001)),
    )
  ) {
    return "Informe ao menos uma opção, estoque inteiro e preço válido (até duas casas decimais).";
  }
  if (new Set(variants.map((v) => getVariantLabel(v).toLowerCase())).size !== variants.length)
    return "As combinações não podem se repetir.";
  return null;
}
export function getCartAvailableStock(item: {
  variantId?: string;
  pricingProduct?: { stock: number; color_variants?: Json };
}) {
  return item.variantId
    ? (getColorVariants(item.pricingProduct).find((v) => v.id === item.variantId)?.stock ?? 0)
    : (item.pricingProduct?.stock ?? 100);
}

export function getVariantAttributes(v: ColorVariant) {
  return {
    color: (v.color ?? v.name).trim(),
    size: (v.size ?? "").trim(),
    brake: (v.brake ?? "").trim(),
  };
}
export function getVariantLabel(v: ColorVariant) {
  return Object.values(getVariantAttributes(v)).filter(Boolean).join(" — ");
}

// A custom combination price applies equally to cash and installments.
// Without a custom price, all product pricing rules are inherited.
export function getVariantPricingProduct<T extends { price: number }>(
  product: T,
  variant?: ColorVariant,
): T {
  if (variant?.price == null) return product;
  return {
    ...product,
    price: variant.price,
    installment_price: variant.price,
    price_2x: variant.price,
    has_installment_surcharge: false,
    bulk_discount_threshold: null,
    bulk_discount_price: null,
    bulk_has_installment_surcharge: false,
    bulk_installment_price: null,
  };
}
