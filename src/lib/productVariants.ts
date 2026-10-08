import type { Json } from "@/integrations/supabase/types";

export interface ColorVariant {
  id: string;
  name: string;
  stock: number;
  image_url: string | null;
}
export function getColorVariants(
  product: { color_variants?: Json } | null | undefined,
): ColorVariant[] {
  if (!Array.isArray(product?.color_variants)) return [];
  return product.color_variants.filter(
    (v) =>
      !!v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof v.id === "string" &&
      typeof v.name === "string" &&
      Number.isInteger(v.stock) &&
      Number(v.stock) >= 0,
  ) as unknown as ColorVariant[];
}
export function variantsToJson(variants: ColorVariant[]): Json {
  return variants.map((v) => ({ ...v, name: v.name.trim() }));
}
export function validateVariants(variants: ColorVariant[]) {
  if (
    variants.length > 40 ||
    variants.some(
      (v) => !v.name.trim() || !Number.isInteger(v.stock) || v.stock < 0 || v.stock > 999999,
    )
  ) {
    return "Informe uma cor e um estoque inteiro válido para cada opção.";
  }
  if (new Set(variants.map((v) => v.name.trim().toLowerCase())).size !== variants.length)
    return "As cores não podem se repetir.";
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
