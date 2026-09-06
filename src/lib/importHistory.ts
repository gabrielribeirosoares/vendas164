export interface ImportBatchRecord {
  id: string;
  storeId: string;
  fileName: string;
  importedAt: string; // ISO string
  orderCount: number;
  orderIds: string[];
  productIds: string[];
  isUndone: boolean;
}

const STORAGE_KEY = "vendas164_import_history";

export function getImportHistory(storeId?: string): ImportBatchRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: ImportBatchRecord[] = JSON.parse(raw);
    if (storeId) {
      return parsed.filter((item) => item.storeId === storeId);
    }
    return parsed;
  } catch {
    return [];
  }
}

export function getLastActiveImport(storeId: string): ImportBatchRecord | null {
  const list = getImportHistory(storeId);
  // Retorna a importação mais recente ativa (não desfeita e com pedidos)
  const active = list.filter((item) => !item.isUndone && item.orderIds && item.orderIds.length > 0);
  return active.length > 0 ? active[0] : null;
}

export function recordImportBatch({
  storeId,
  fileName,
  orderIds,
  productIds = [],
}: {
  storeId: string;
  fileName: string;
  orderIds: string[];
  productIds?: string[];
}): ImportBatchRecord {
  const newRecord: ImportBatchRecord = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    storeId,
    fileName: fileName || "planilha.csv",
    importedAt: new Date().toISOString(),
    orderCount: orderIds.length,
    orderIds,
    productIds,
    isUndone: false,
  };

  try {
    const existing = getImportHistory();
    const updated = [newRecord, ...existing.filter((x) => x.id !== newRecord.id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("import_history_updated", { detail: { storeId } }));
  } catch (err) {
    console.error("Falha ao salvar histórico de importação:", err);
  }

  return newRecord;
}

export function markImportAsUndone(batchId: string) {
  try {
    const existing = getImportHistory();
    const updated = existing.map((item) =>
      item.id === batchId ? { ...item, isUndone: true } : item
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("import_history_updated"));
  } catch (err) {
    console.error("Falha ao marcar importação como desfeita:", err);
  }
}
