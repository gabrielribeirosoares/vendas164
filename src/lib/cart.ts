import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tables } from '@/integrations/supabase/types';
import { getInstallmentOptions, getProductSignalAmount, hasNoSignalRequirement, isProntaEntrega } from './format';

export type Product = Tables<'products'>;
export interface CartItem {
  id: string;
  productId: string;
  storeId: string;
  storeName?: string;
  quantity: number;
  selectedInstallment: number;
  unitPriceForChosenOption: number;
  totalPrice: number;
  downPaymentToPay: number;
  remainingBalance: number;
  hasNoSignal: boolean;
  isProntaEntrega?: boolean;
  pricingProduct?: Product;
  productSnapshot: { model: string; brand: string; image_url: string | null; scale: string | null };
}

const money = (value: number) => Math.round(value * 100) / 100;
export function repriceCartItem(item: CartItem, quantity: number, product = item.pricingProduct): CartItem {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('invalid_quantity');
  const option = product && getInstallmentOptions(product, quantity).find(o => o.value === item.selectedInstallment);
  if (product && !option) throw new Error('invalid_installments');
  const unit = money(option ? option.totalPrice / quantity : item.unitPriceForChosenOption);
  const totalPrice = money(unit * quantity);
  const signal = product ? Math.min(unit, getProductSignalAmount(product, 1).amount) : item.downPaymentToPay / item.quantity;
  const downPaymentToPay = money(signal * quantity);
  return { ...item, quantity, pricingProduct: product, unitPriceForChosenOption: unit, totalPrice, downPaymentToPay,
    remainingBalance: money(totalPrice - downPaymentToPay),
    hasNoSignal: product ? hasNoSignalRequirement(product) : item.hasNoSignal,
    isProntaEntrega: product ? isProntaEntrega(product) : item.isProntaEntrega };
}
interface CartStore {
  items: CartItem[];
  requestId: string | null;
  addItem: (item: Omit<CartItem, 'id'>) => void;
  updateQuantity: (id: string, quantity: number) => void;
  refreshPrices: (products: Product[]) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getRequestId: () => string;
  getCartTotal: () => number;
  getCartDownPaymentTotal: () => number;
  getItemsByStore: (storeId: string) => CartItem[];
}
export const useCartStore = create<CartStore>()(persist((set, get) => ({
  items: [], requestId: null,
  addItem: (item) => set(state => {
    const existing = state.items.find(i => i.productId === item.productId && i.selectedInstallment === item.selectedInstallment);
    const next = repriceCartItem({ ...item, id: existing?.id ?? crypto.randomUUID() }, (existing?.quantity ?? 0) + item.quantity);
    return { requestId: null, items: existing ? state.items.map(i => i.id === existing.id ? next : i) : [...state.items, next] };
  }),
  updateQuantity: (id, quantity) => set(state => ({ requestId: null, items: state.items.map(i => i.id === id ? repriceCartItem(i, quantity) : i) })),
  refreshPrices: products => set(state => ({ requestId: null, items: state.items.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) throw new Error('product_not_found');
    return repriceCartItem(item, item.quantity, product);
  }) })),
  removeItem: id => set(state => ({ requestId: null, items: state.items.filter(i => i.id !== id) })),
  clearCart: () => set({ items: [], requestId: null }),
  getRequestId: () => {
    const id = get().requestId ?? crypto.randomUUID();
    set({ requestId: id });
    return id;
  },
  getCartTotal: () => money(get().items.reduce((sum, item) => sum + item.totalPrice, 0)),
  getCartDownPaymentTotal: () => money(get().items.reduce((sum, item) => sum + item.downPaymentToPay, 0)),
  getItemsByStore: storeId => get().items.filter(item => item.storeId === storeId),
}), { name: 'vendas164-cart' }));
