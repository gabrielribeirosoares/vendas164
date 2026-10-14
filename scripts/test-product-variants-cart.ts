import assert from "node:assert/strict";
import { useCartStore } from "../src/lib/cart";
const product: any = {
  id: "p",
  price: 100,
  stock: 3,
  release_date: null,
  payment_deadline_hours: 0,
  max_installments: 1,
  color_variants: [
    { id: "red", name: "Vermelho", stock: 1, image_url: "red.webp" },
    { id: "blue", name: "Azul", stock: 2, image_url: "blue.webp" },
  ],
};
const base: any = {
  productId: "p",
  storeId: "s",
  quantity: 1,
  selectedInstallment: 1,
  unitPriceForChosenOption: 100,
  totalPrice: 100,
  downPaymentToPay: 0,
  remainingBalance: 100,
  hasNoSignal: true,
  pricingProduct: product,
  productSnapshot: { model: "Rodinhas", brand: "Kit", image_url: null, scale: "1:64" },
};
const cart = useCartStore;
cart.getState().clearCart();
cart.getState().addItem({ ...base, variantId: "red" });
cart.getState().addItem({ ...base, variantId: "blue" });
assert.equal(cart.getState().items.length, 2);
assert.deepEqual(
  cart.getState().items.map((i) => i.variantName),
  ["Vermelho", "Azul"],
);
assert.deepEqual(
  cart.getState().items.map((i) => i.productSnapshot.image_url),
  ["red.webp", "blue.webp"],
);
assert.throws(() => cart.getState().addItem({ ...base, variantId: "red" }), /variant_out_of_stock/);
cart.getState().addItem({ ...base, variantId: "blue" });
assert.equal(cart.getState().items[1].quantity, 2);
assert.equal(cart.getState().getCartTotal(), 300);
assert.throws(() => cart.getState().addItem(base), /variant_required/);
assert.throws(
  () =>
    cart
      .getState()
      .refreshPrices([
        { ...product, color_variants: product.color_variants.filter((v) => v.id !== "red") },
      ]),
  /variant_required/,
);
console.log(
  "Cart: colors stay separate, snapshots and price refresh validated, stock limits enforced.",
);

cart.getState().clearCart();
const combinations = {
  ...product,
  bulk_discount_threshold: 2,
  bulk_discount_price: 50,
  color_variants: [
    {
      id: "wheel",
      name: "Azul — 12 mm — Com freio",
      color: "Azul",
      size: "12 mm",
      brake: "Com freio",
      price: 150.5,
      stock: 3,
      image_url: "wheel.webp",
    },
  ],
};
cart.getState().addItem({ ...base, pricingProduct: combinations, variantId: "wheel", quantity: 2 });
assert.equal(cart.getState().items[0].totalPrice, 301);
assert.equal(cart.getState().items[0].variantName, "Azul — 12 mm — Com freio");
assert.equal(cart.getState().items[0].pricingProduct?.price, 100);
cart
  .getState()
  .refreshPrices([
    { ...combinations, color_variants: [{ ...combinations.color_variants[0], price: 160 }] },
  ]);
assert.equal(cart.getState().items[0].totalPrice, 320);
console.log(
  "Cart: combination price overrides bulk pricing and refreshes from the original product.",
);
