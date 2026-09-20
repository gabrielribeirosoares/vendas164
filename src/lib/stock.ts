/**
 * Utilitários para exibição e controle consistente do estoque inicial e restante de produtos.
 */

export const ZERO51_GARAGE_STORE_ID = "b2d3e709-3d0c-4dc1-be97-6c92b961f210";

/**
 * Retorna o limite (threshold) de estoque para exibição da quantidade na vitrine.
 * Se o estoque for >= threshold, oculta o número exato e exibe apenas "Disponível".
 * A quantidade numérica só aparece quando o estoque estiver estritamente abaixo do limite (< threshold).
 * Para a loja Zero51 garage (b2d3e709-3d0c-4dc1-be97-6c92b961f210), o padrão é 5.
 */
export function getStoreStockDisplayThreshold(storeId?: string | null): number | null {
  if (!storeId) return null;

  // Zero51 garage tem regra mandatória padrão de 5 unidades
  if (storeId === ZERO51_GARAGE_STORE_ID) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const custom = localStorage.getItem(`minipre_store_stock_threshold_${storeId}`);
        if (custom !== null) {
          const val = parseInt(custom, 10);
          return isNaN(val) ? 5 : val;
        }
      }
    } catch {
      // ignore
    }
    return 5;
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const custom = localStorage.getItem(`minipre_store_stock_threshold_${storeId}`);
      if (custom !== null) {
        const val = parseInt(custom, 10);
        return isNaN(val) ? null : val;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveStoreStockDisplayThreshold(storeId: string, threshold: number | null) {
  if (!storeId) return;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (threshold === null || threshold <= 0) {
        localStorage.removeItem(`minipre_store_stock_threshold_${storeId}`);
      } else {
        localStorage.setItem(`minipre_store_stock_threshold_${storeId}`, String(threshold));
      }
    }
  } catch {
    // ignore
  }
}

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
 * "Disponível" | "1 unidade restante" | "4 unidades restantes" | "Esgotado" | "Fechada"
 */
export function formatStockRemaining(
  product?: {
    stock?: number | null;
    initial_stock?: number | null;
    is_open?: boolean;
    store_id?: string | null;
  } | null,
  storeId?: string | null
): string {
  if (!product) return "";
  if (product.is_open === false) return "Fechada";

  const stock = Number(product.stock ?? 0);
  if (stock <= 0) return "Esgotado";

  const effectiveStoreId = storeId || product.store_id;
  const threshold = getStoreStockDisplayThreshold(effectiveStoreId);

  // Se houver limite configurado e o estoque for >= threshold, oculta a quantidade exata
  if (threshold !== null && threshold > 0 && stock >= threshold) {
    return "Disponível";
  }

  return `${stock} ${stock === 1 ? "unidade restante" : "unidades restantes"}`;
}

/**
 * Retorna as informações formatadas para o rodapé do card da vitrine da loja:
 */
export function formatStoreProductCardStock(product?: {
  stock?: number | null;
  is_open?: boolean;
  store_id?: string | null;
} | null): { text: string; isScarce: boolean; isAvailable: boolean } {
  if (!product) {
    return { text: "", isScarce: false, isAvailable: false };
  }

  if (product.is_open === false) {
    return { text: "Pré-venda encerrada", isScarce: false, isAvailable: false };
  }

  const stock = Number(product.stock ?? 0);
  if (stock <= 0) {
    return { text: "Indisponível — consulte a fila", isScarce: false, isAvailable: false };
  }

  const threshold = getStoreStockDisplayThreshold(product.store_id);

  // Se houver limite configurado e o estoque for >= threshold, oculta a quantidade exata
  if (threshold !== null && threshold > 0 && stock >= threshold) {
    return { text: "Disponível", isScarce: false, isAvailable: true };
  }

  if (stock === 1) {
    return { text: "Última unidade disponível", isScarce: true, isAvailable: true };
  }

  if (stock <= 2) {
    return { text: `${stock} unidades disponíveis`, isScarce: true, isAvailable: true };
  }

  return { text: `${stock} unidades disponíveis`, isScarce: false, isAvailable: true };
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
