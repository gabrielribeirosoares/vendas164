/**
 * Utilitários para exibição e controle consistente do estoque inicial e restante de produtos.
 */

/**
 * Retorna o estoque total original cadastrado (initial_stock).
 * Se não existir, usa o estoque atual como fallback.
 */
export function getProductTotalStock(product?: {
  stock?: number | null;
  initial_stock?: number | null;
} | null): number {
  if (!product) return 0;
  const currentStock = Number(product.stock ?? 0);
  const dbInitial = Number((product as any).initial_stock ?? 0);
  return dbInitial > 0 ? dbInitial : currentStock;
}

/**
 * Formato amigável e limpo para o cliente final:
 * "1 unidade restante" | "10 unidades restantes" | "Esgotado" | "Fechada"
 */
export function formatStockRemaining(product?: {
  stock?: number | null;
  initial_stock?: number | null;
  is_open?: boolean;
} | null): string {
  if (!product) return "";
  if (product.is_open === false) return "Fechada";

  const stock = Number(product.stock ?? 0);
  if (stock <= 0) return "Esgotado";

  return `${stock} ${stock === 1 ? "unidade restante" : "unidades restantes"}`;
}

/**
 * Formato com total original para controle interno do lojista:
 * "10 de 11 un" — quantas restam do total inicial cadastrado
 */
export function formatStockWithTotal(product?: {
  stock?: number | null;
  initial_stock?: number | null;
  is_open?: boolean;
} | null): string {
  if (!product) return "";
  if (product.is_open === false) return "Fechada";

  const stock = Number(product.stock ?? 0);
  if (stock <= 0) return "Esgotado";

  const total = getProductTotalStock(product);
  return `${stock} de ${total} un`;
}
