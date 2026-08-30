import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Tables } from '@/integrations/supabase/types';

export type Product = Tables<"products">;

export interface CartItem {
  id: string; // unique id for the cart item
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
  productSnapshot: {
    model: string;
    brand: string;
    image_url: string | null;
    scale: string | null;
  };
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartDownPaymentTotal: () => number;
  getItemsByStore: (storeId: string) => CartItem[];
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => set((state) => {
        // Verifica se já existe o mesmo produto e mesmo parcelamento
        const existingItem = state.items.find(i => i.productId === item.productId && i.selectedInstallment === item.selectedInstallment);
        if (existingItem) {
          return {
            items: state.items.map(i => 
              i.id === existingItem.id 
                ? { 
                    ...i, 
                    quantity: i.quantity + item.quantity,
                    totalPrice: i.totalPrice + item.totalPrice,
                    downPaymentToPay: i.downPaymentToPay + item.downPaymentToPay,
                    remainingBalance: i.remainingBalance + item.remainingBalance
                  } 
                : i
            )
          };
        }
        return { items: [...state.items, { ...item, id: crypto.randomUUID() }] };
      }),
      removeItem: (id) => set((state) => ({
        items: state.items.filter(item => item.id !== id)
      })),
      clearCart: () => set({ items: [] }),
      getCartTotal: () => get().items.reduce((total, item) => total + item.totalPrice, 0),
      getCartDownPaymentTotal: () => get().items.reduce((total, item) => total + item.downPaymentToPay, 0),
      getItemsByStore: (storeId) => get().items.filter(item => item.storeId === storeId),
    }),
    {
      name: 'vendas164-cart', // key no localStorage
    }
  )
);
