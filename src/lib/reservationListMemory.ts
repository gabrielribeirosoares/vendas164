export type ReservationListPreferences = {
  page: number;
  pageSize: number;
  searchQuery: string;
  startDate: string;
  endDate: string;
  paymentFilter: string;
  deliveryFilter: string;
  categoryFilter: "todos" | "pre_venda" | "pronta_entrega";
  viewMode: "table" | "kanban";
  listScroll: number;
  windowScroll: number;
};
const memory = new Map<string, ReservationListPreferences>();
export function reservationListKey(userId: string, storeId: string, focus?: string) {
  return JSON.stringify([userId, storeId, focus || "all"]);
}
export function readReservationList(key: string): ReservationListPreferences {
  return { ...(memory.get(key) || {
    page: 0, pageSize: 25, searchQuery: "", startDate: "", endDate: "",
    paymentFilter: "todos", deliveryFilter: "todos", categoryFilter: "todos",
    viewMode: "table", listScroll: 0, windowScroll: 0,
  }) };
}
export function saveReservationList(key: string, preferences: ReservationListPreferences) {
  // Only called by browser effects: never retain account data in an SSR request.
  memory.delete(key);
  memory.set(key, { ...preferences });
  if (memory.size > 30) memory.delete(memory.keys().next().value!);
}
