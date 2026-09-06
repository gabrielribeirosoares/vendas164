import { ManualReservationDialog } from "./ManualReservationDialog";
import { BookmarkCheck, CopyPlus, Zap, Sparkles } from "lucide-react";
import { formatDeadlineHours, getProductInstallmentInfo, hasNoSignalRequirement, isProntaEntrega } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";


import { getProductBadge, saveProductBadge, saveProductCategory, PRESET_BADGES } from "@/lib/storeCustomizations";
import { BlingIntegrationDialog } from "@/components/vendedor/BlingIntegrationDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl, slugify } from "@/lib/format";
import { getStoreFullUrl } from "@/lib/subdomain";

import { uploadImage } from "@/lib/upload";
import { getStoreBrands, saveStoreBrands } from "@/lib/brands";
import { getProductTotalStock } from "@/lib/stock";
import type { Tables } from "@/integrations/supabase/types";

type Store = Tables<"stores">;
type Product = Tables<"products">;

const emptyProduct = {
  brand: "",
  model: "",
  scale: "1:64",
  price: "",
  cost_price: "",
  max_installments: "1",
  has_surcharge: "false",
  installment_price: "",
  down_payment_amount: "",
  release_date: "",
  stock: "1",
  payment_deadline_date: "",
  payment_deadline_hours: "24",
  image_url: "",
  bulk_discount_threshold: "",
  bulk_discount_price: "",
  bulk_has_installment_surcharge: "false",
  bulk_installment_price: "",
  category: "pre_venda",
  badge: "",
};

export function ProductsTab({
  store,
  products,
  userId,
  mode = "pre_venda",
  onSelectTab,
  onlyOutOfStock = false,
  onClearStockFilter,
}: {
  store: Store;
  onlyOutOfStock?: boolean;
  onClearStockFilter?: () => void;
  products: Product[];
  userId: string;
  mode?: "pre_venda" | "pronta_entrega" | "all";
  onSelectTab?: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...emptyProduct, category: mode === "pronta_entrega" ? "pronta_entrega" : "pre_venda" });
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualReservationProduct, setManualReservationProduct] = useState<Product | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [blingOpen, setBlingOpen] = useState(false);

  const isBlingEligible = true;

  const displayedProducts = useMemo(() => {
    if (mode === "pronta_entrega") {
      return products.filter((p) => isProntaEntrega(p) && (!onlyOutOfStock || p.stock === 0));
    }
    if (mode === "pre_venda") {
      return products.filter((p) => !isProntaEntrega(p) && (!onlyOutOfStock || p.stock === 0));
    }
    return products;
  }, [products, mode, onlyOutOfStock]);

  const configuredBrands = useMemo(() => getStoreBrands(store.id), [store.id]);
  const availableBrandOptions = useMemo(() => {
    const set = new Set([...configuredBrands]);
    displayedProducts.forEach((p) => p.brand && set.add(p.brand.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configuredBrands, displayedProducts]);

  const brandsMap: Record<string, Product[]> = {};
  for (const p of displayedProducts) {
    const brandName = (p.brand || "Outros").trim();
    if (!brandsMap[brandName]) brandsMap[brandName] = [];
    brandsMap[brandName].push(p);
  }
  const brandList = Object.keys(brandsMap).sort((a, b) => a.localeCompare(b));
  const filteredBrands = selectedBrand === "all" ? brandList : brandList.filter((b) => b === selectedBrand);

  function handleReserveUnidade(p: Product) {
    if (!p.is_open) return toast.error("Este item está fechado para reservas.");
    if (p.stock <= 0) return toast.error("Não há unidades disponíveis para esta miniatura.");

    setManualReservationProduct(p);
    setManualDialogOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim()) {
      return toast.error("Por favor, selecione ou informe a marca da miniatura.");
    }

    setSaving(true);
    const isPronta = (form as any).category === "pronta_entrega" || mode === "pronta_entrega";
    const isSemSinal = isPronta || (form as any).signal_rule === "sem_sinal";
    let computedHours = isSemSinal ? 0 : 24;
    if (!isSemSinal && form.payment_deadline_date) {
      const targetDate = new Date(form.payment_deadline_date + "T23:59:59");
      computedHours = Math.max(0, Math.round((targetDate.getTime() - Date.now()) / (1000 * 60 * 60)));
    } else if (!isSemSinal && (form.down_payment_amount === "" || Number(form.down_payment_amount || 0) === 0)) {
      computedHours = 0;
    }

    const maxInst = Number(form.max_installments || 1);
    const hasSurcharge = maxInst > 1 && form.has_surcharge === "true";
    const instPrice = maxInst > 1 ? (hasSurcharge && form.installment_price ? Number(form.installment_price) : Number(form.price || 0)) : null;

    const payload: any = {
      store_id: store.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      max_installments: maxInst,
      has_installment_surcharge: hasSurcharge,
      installment_price: instPrice,
      price_2x: maxInst === 2 ? instPrice : null,
      release_date: isPronta ? null : (form.release_date ? (form.release_date.length === 7 ? form.release_date + "-01" : form.release_date) : null),
      payment_deadline_date: isSemSinal ? null : (form.payment_deadline_date || null),
      payment_deadline_hours: isSemSinal ? 0 : computedHours,
      down_payment_amount: isSemSinal || form.down_payment_amount === "" ? null : Number(form.down_payment_amount || 0),
      stock: Number(form.stock || 0),
      initial_stock: Number(form.stock || 0),
      image_url: form.image_url || null,
      slug: slugify(`${form.brand.trim()}-${form.model.trim()}`),
      bulk_discount_threshold: (form as any).bulk_discount_threshold ? Number((form as any).bulk_discount_threshold) : null,
      bulk_discount_price: (form as any).bulk_discount_price ? Number((form as any).bulk_discount_price) : null,
      bulk_has_installment_surcharge: (form as any).bulk_has_installment_surcharge === "true",
      bulk_installment_price: (form as any).bulk_has_installment_surcharge === "true" && (form as any).bulk_installment_price ? Number((form as any).bulk_installment_price) : null,
    };

    let { error } = await supabase.from("products").insert(payload);

    // Fallbacks progressivos para lidar com colunas opcionais ausentes no banco
    if (error && (error.code === "PGRST204" || error.message?.includes("initial_stock") || (error as any).status === 400)) {
      delete (payload as any).initial_stock;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("bulk_discount") || error.message?.includes("bulk_has_installment_surcharge") || error.message?.includes("bulk_installment_price") || (error as any).status === 400)) {
      delete payload.bulk_discount_threshold;
      delete payload.bulk_discount_price;
      delete payload.bulk_has_installment_surcharge;
      delete payload.bulk_installment_price;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("cost_price") || (error as any).status === 400)) {
      delete payload.cost_price;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("max_installments") || error.message?.includes("has_installment_surcharge") || (error as any).status === 400)) {
      delete payload.max_installments;
      delete payload.price_2x;
      delete payload.installment_price;
      delete payload.has_installment_surcharge;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error) {
      delete payload.payment_deadline_date;
      const retry1 = await supabase.from("products").insert(payload);
      error = retry1.error;

      if (error) {
        delete payload.down_payment_amount;
        const retry2 = await supabase.from("products").insert(payload);
        error = retry2.error;
      }
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a miniatura.");

    // Se adicionou uma marca customizada, salvar na lista da loja
    if (form.brand.trim() && !configuredBrands.includes(form.brand.trim())) {
      saveStoreBrands(store.id, [...configuredBrands, form.brand.trim()]);
    }

    const effectiveBadge = (form as any).badge || (isPronta ? "Pronta Entrega" : "");
    if (isPronta || effectiveBadge) {
      const { data: latest } = await supabase.from("products").select("id").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest) {
        if (isPronta) {
          saveProductCategory(latest.id, "pronta_entrega");
        }
        if (effectiveBadge) {
          saveProductBadge(latest.id, effectiveBadge);
        }
      }
    }

    setForm({ ...emptyProduct, category: mode === "pronta_entrega" ? "pronta_entrega" : "pre_venda" });
    setSheetOpen(false);
    setIsCustomBrand(false);
    queryClient.invalidateQueries({ queryKey: ["store-products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["store-orders"] });
    toast.success(isPronta ? "Item a pronta entrega cadastrado!" : "Pré-venda cadastrada!");
  }

  async function toggleOpen(product: Product) {
    await supabase.from("products").update({ is_open: !product.is_open }).eq("id", product.id);
    queryClient.invalidateQueries();
  }

  async function handleQuickStock(product: Product, delta: number) {
    const currentStock = product.stock ?? 0;
    const newStock = Math.max(0, currentStock + delta);
    // initial_stock acompanha o delta: se lojista adiciona/remove unidades, o total original muda junto
    const currentInitial = (product as any).initial_stock ?? currentStock;
    const newInitial = Math.max(newStock, currentInitial + delta);

    let { error } = await supabase.from("products").update({
      stock: newStock,
      initial_stock: newInitial,
      is_open: newStock > 0 ? product.is_open : false,
    }).eq("id", product.id);

    // Se a coluna initial_stock ainda não existir no banco, tenta sem ela
    if (error && ((error as any).status === 400 || error.message?.includes("initial_stock"))) {
      const retry = await supabase.from("products").update({
        stock: newStock,
        is_open: newStock > 0 ? product.is_open : false,
      }).eq("id", product.id);
      error = retry.error;
    }

    if (error) return toast.error("Erro ao alterar estoque.");
    queryClient.invalidateQueries();
    toast.success(`Estoque de "${product.model}": ${newStock} un.`);
  }

  function handleDuplicateProduct(p: Product) {
    setForm({
      brand: p.brand || "",
      model: `${p.model} (Nova Edição)`,
      scale: p.scale || "1:64",
      price: String(p.price || ""),
      cost_price: (p as any).cost_price ? String((p as any).cost_price) : "",
      max_installments: String((p as any).max_installments || "1"),
      has_surcharge: (p as any).has_installment_surcharge ? "true" : "false",
      installment_price: (p as any).installment_price ? String((p as any).installment_price) : "",
      down_payment_amount: (p as any).down_payment_amount ? String((p as any).down_payment_amount) : "",
      release_date: p.release_date ? p.release_date.slice(0, 7) : "",
      stock: "1",
      payment_deadline_date: (p as any).payment_deadline_date || "",
      payment_deadline_hours: String((p as any).payment_deadline_hours || "24"),
      image_url: p.image_url || "",
      bulk_discount_threshold: (p as any).bulk_discount_threshold ? String((p as any).bulk_discount_threshold) : "",
      bulk_discount_price: (p as any).bulk_discount_price ? String((p as any).bulk_discount_price) : "",
      bulk_has_installment_surcharge: (p as any).bulk_has_installment_surcharge ? "true" : "false",
      bulk_installment_price: (p as any).bulk_installment_price ? String((p as any).bulk_installment_price) : "",
    } as any);

    if (p.brand && !availableBrandOptions.includes(p.brand)) {
      setIsCustomBrand(true);
    } else {
      setIsCustomBrand(false);
    }

    toast.info(`Dados de "${p.model}" carregados no formulário de cadastro!`);
    setSheetOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(product: Product) {
    try {
      // Primeiro remove da waitlist (pode ter FK sem cascade)
      await supabase.from("waitlist").delete().eq("product_id", product.id);

      const { error } = await supabase.from("products").delete().eq("id", product.id);

      if (error) {
        // FK ainda ativa por orders vinculadas — orienta o lojista
        if ((error as any).status === 400 || (error as any).code === "23503") {
          toast.error(
            "Não é possível excluir: há reservas vinculadas a esta pré-venda. Cancele ou exclua as reservas antes de remover o produto."
          );
          return;
        }
        toast.error("Erro ao remover a miniatura.");
        return;
      }

      queryClient.invalidateQueries();
      toast.success("Miniatura removida.");
    } catch {
      toast.error("Erro ao remover a miniatura.");
    }
  }

  async function onFile(file: File) {
    try {
      const url = await uploadImage(userId, file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Foto enviada!");
    } catch {
      toast.error("Falha ao enviar a foto.");
    }
  }

  return (
    <>
      {onlyOutOfStock && <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>Produtos esgotados</span><Button variant="ghost" size="sm" onClick={onClearStockFilter}>Mostrar todos</Button></div>}
      {/* Sheet lateral com o formulário */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-semibold flex items-center gap-2">
              {mode === "pronta_entrega" ? (
                <>
                  <Zap className="size-5 text-emerald-500" />
                  <span>Cadastrar miniatura a pronta entrega</span>
                </>
              ) : (
                <span>Nova pré-venda</span>
              )}
            </SheetTitle>
          </SheetHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="brand" className="text-xs font-medium text-muted-foreground">Marca</Label>
                  <Select
                    value={
                      isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))
                        ? "__custom"
                        : form.brand
                    }
                    onValueChange={(val) => {
                      if (val === "__custom") {
                        setIsCustomBrand(true);
                        setForm((f) => ({ ...f, brand: "" }));
                      } else {
                        setIsCustomBrand(false);
                        setForm((f) => ({ ...f, brand: val }));
                      }
                    }}
                  >
                    <SelectTrigger id="brand" className="bg-muted/20 border-border/30">
                      <SelectValue placeholder="Selecione a marca" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBrandOptions.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom" className="font-semibold text-primary">+ Outra marca...</SelectItem>
                    </SelectContent>
                  </Select>
                  {(isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))) && (
                    <Input
                      placeholder="Digite a nova marca..."
                      maxLength={40}
                      required
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      className="text-xs sm:text-sm bg-muted/20 border-border/30"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scale" className="text-xs font-medium text-muted-foreground">Escala</Label>
                  <Input
                    id="scale"
                    maxLength={12}
                    value={form.scale}
                    onChange={(e) => setForm({ ...form, scale: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="model" className="text-xs font-medium text-muted-foreground">Modelo</Label>
                  <Input
                    id="model"
                    required
                    maxLength={80}
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="badge" className="text-xs font-medium text-muted-foreground">Selo (Badge)</Label>
                  <Select
                    value={(form as any).badge || "__none"}
                    onValueChange={(val) => setForm({ ...form, badge: val === "__none" ? "" : val } as any)}
                  >
                    <SelectTrigger id="badge" className="bg-muted/20 border-border/30">
                      <SelectValue placeholder="Selo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PRESET_BADGES.map((b) => (
                        <SelectItem key={b.value || "__none"} value={b.value || "__none"}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cost_price" className="text-xs font-medium text-muted-foreground">Custo (R$) <span className="text-[10px] font-normal opacity-70">(Opcional)</span></Label>
                  <Input
                    id="cost_price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="150"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-xs font-medium text-muted-foreground">Venda À vista (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="240"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                {mode !== "pronta_entrega" && (
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <Label htmlFor="signal_rule" className="text-xs font-medium text-muted-foreground whitespace-nowrap">Exigência Sinal</Label>
                    <Select 
                      value={(form as any).signal_rule || "aguardando_sinal"} 
                      onValueChange={(val) => {
                        if (val === 'sem_sinal') {
                          setForm({ ...form, signal_rule: 'sem_sinal', down_payment_amount: '', payment_deadline_date: '', payment_deadline_hours: '0' } as any);
                        } else {
                          setForm({ ...form, signal_rule: 'aguardando_sinal', payment_deadline_hours: '24' } as any);
                        }
                      }}
                    >
                      <SelectTrigger id="signal_rule" className="h-9 text-xs bg-muted/20 border-border/30 w-full text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aguardando_sinal">Obrigatório</SelectItem>
                        <SelectItem value="sem_sinal">Não obrigatório (Na chegada)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {mode !== "pronta_entrega" && ((form as any).signal_rule !== 'sem_sinal') && (
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <Label htmlFor="down_payment" className="text-xs font-medium text-muted-foreground">Sinal (R$)</Label>
                    <Input
                      id="down_payment"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 50 (Padrão 20%)"
                      value={form.down_payment_amount}
                      onChange={(e) => setForm({ ...form, down_payment_amount: e.target.value })}
                      className="bg-muted/20 border-border/30 h-9"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="stock" className="text-xs font-medium text-muted-foreground">Unidades</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    required
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Desconto por Quantidade (Atacado)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk_threshold" className="text-xs font-medium text-muted-foreground">A partir de (unidades)</Label>
                    <Input
                      id="bulk_threshold"
                      type="number"
                      min="2"
                      placeholder="Ex: 3"
                      value={(form as any).bulk_discount_threshold}
                      onChange={(e) => setForm({ ...form, bulk_discount_threshold: e.target.value } as any)}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk_price" className="text-xs font-medium text-muted-foreground">Novo Valor Unitário (R$)</Label>
                    <Input
                      id="bulk_price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 180"
                      value={(form as any).bulk_discount_price}
                      onChange={(e) => setForm({ ...form, bulk_discount_price: e.target.value } as any)}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                </div>

                {Number(form.max_installments) > 1 && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento (Atacado)</Label>
                        <Select
                          value={(form as any).bulk_has_installment_surcharge}
                          onValueChange={(val) => setForm({ ...form, bulk_has_installment_surcharge: val } as any)}
                        >
                          <SelectTrigger className="bg-muted/20 border-border/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                            <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {(form as any).bulk_has_installment_surcharge === "true" && (
                      <div className="space-y-1.5 pt-1 mt-3">
                        <Label htmlFor="bulk_inst_price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado no Atacado (R$)</Label>
                        <Input
                          id="bulk_inst_price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ex: 200"
                          value={(form as any).bulk_installment_price}
                          onChange={(e) => setForm({ ...form, bulk_installment_price: e.target.value } as any)}
                          className="bg-muted/20 border-border/30"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border/30 bg-muted/15 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Máximo de parcelas</Label>
                    <Select
                      value={form.max_installments}
                      onValueChange={(val) => setForm({ ...form, max_installments: val })}
                    >
                      <SelectTrigger className="bg-muted/20 border-border/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x (Apenas à vista)</SelectItem>
                        <SelectItem value="2">Até 2x</SelectItem>
                        <SelectItem value="3">Até 3x</SelectItem>
                        <SelectItem value="4">Até 4x</SelectItem>
                        <SelectItem value="5">Até 5x</SelectItem>
                        <SelectItem value="6">Até 6x</SelectItem>
                        <SelectItem value="10">Até 10x</SelectItem>
                        <SelectItem value="12">Até 12x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {Number(form.max_installments) > 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento</Label>
                      <Select
                        value={form.has_surcharge}
                        onValueChange={(val) => setForm({ ...form, has_surcharge: val })}
                      >
                        <SelectTrigger className="bg-muted/20 border-border/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                          <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {Number(form.max_installments) > 1 && (
                  <div>
                    {form.has_surcharge === "true" ? (
                      <div className="space-y-1.5 pt-1">
                        <Label htmlFor="inst_price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado (R$)</Label>
                        <Input
                          id="inst_price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ex: 260"
                          value={form.installment_price}
                          onChange={(e) => setForm({ ...form, installment_price: e.target.value })}
                          className="bg-muted/20 border-border/30"
                        />
                        {Number(form.installment_price) > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.installment_price) / Number(form.max_installments))}</strong> (com acréscimo)
                          </p>
                        )}
                      </div>
                    ) : (
                      Number(form.price) > 0 && (
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.price) / Number(form.max_installments))}</strong> sem acréscimo.
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
              {mode !== "pronta_entrega" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="release" className="text-xs font-medium text-muted-foreground">Data estimada</Label>
                    <Input
                      id="release"
                      type="month"
                      value={form.release_date}
                      onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signal-deadline" className="text-xs font-medium text-muted-foreground">Data limite para o sinal</Label>
                    <Input
                      id="signal-deadline"
                      type="date"
                      value={form.payment_deadline_date}
                      onChange={(e) => setForm({ ...form, payment_deadline_date: e.target.value })}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="photo" className="text-xs font-medium text-muted-foreground">Foto da miniatura</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  className="bg-muted/20 border-border/30"
                />
                {form.image_url && <p className="text-xs text-success">Foto pronta para publicar.</p>}
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} {mode === "pronta_entrega" ? "Publicar a pronta entrega" : "Publicar pré-venda"}
              </Button>
            </form>
          </SheetContent>
        </Sheet>

      {/* Catálogo em tela cheia */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
            {mode === "pronta_entrega" ? (
              <>
                <Zap className="size-5 text-emerald-500" />
                <span>Pronta Entrega ({displayedProducts.length})</span>
              </>
            ) : mode === "pre_venda" ? (
              <span>Estoque e Pré-vendas ({displayedProducts.length})</span>
            ) : (
              <span>Catálogo da Loja ({displayedProducts.length})</span>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {brandList.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={selectedBrand === "all" ? "default" : "outline"}
                  onClick={() => setSelectedBrand("all")}
                  className="h-7 px-2.5 text-xs rounded-full"
                >
                  Todas ({displayedProducts.length})
                </Button>
                {brandList.map((b) => (
                  <Button
                    key={b}
                    type="button"
                    size="sm"
                    variant={selectedBrand === b ? "default" : "outline"}
                    onClick={() => setSelectedBrand(b)}
                    className="h-7 px-2.5 text-xs rounded-full"
                  >
                    {b} ({brandsMap[b].length})
                  </Button>
                ))}
              </div>
            )}
            {isBlingEligible && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setBlingOpen(true)}
                className="gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-semibold"
                title="Sincronizar e importar catálogo do Bling ERP"
              >
                <Sparkles className="size-3.5 fill-current" />
                <span>Bling ERP</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => { setForm({ ...emptyProduct, category: mode === "pronta_entrega" ? "pronta_entrega" : "pre_venda", badge: mode === "pronta_entrega" ? "Pronta Entrega" : "" }); setIsCustomBrand(false); setSheetOpen(true); }}
              className={`gap-1.5 ${mode === "pronta_entrega" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
            >
              <Plus className="size-4" /> {mode === "pronta_entrega" ? "Nova pronta entrega" : "Nova pré-venda"}
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          {filteredBrands.map((brand) => {
              const brandProducts = brandsMap[brand];
              return (
                <div key={brand} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border/20 pb-2">
                    <h4 className="font-bold text-base">{brand}</h4>
                    <span className="text-xs text-muted-foreground font-medium">{brandProducts.length} {brandProducts.length === 1 ? "miniatura" : "miniaturas"}</span>
                  </div>

                  <div className="space-y-2.5">
                    {brandProducts.map((p) => (
                      <Card key={p.id} className="border-border/30 bg-card/50">
                        <CardContent className="flex flex-wrap items-center gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                              <span>{p.brand} · {p.scale}</span>
                              {isProntaEntrega(p) ? (
                                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  <Zap className="size-2.5" /> Pronta Entrega
                                </span>
                              ) : (
                                <span>· {
                                  (p as any).payment_deadline_date
                                    ? `sinal até ${new Date((p as any).payment_deadline_date + "T00:00:00").toLocaleDateString("pt-BR")}`
                                    : Number(p.payment_deadline_hours) > 0
                                      ? `sinal em ${formatDeadlineHours(p.payment_deadline_hours)}`
                                      : "sem sinal"
                                }</span>
                              )}
                            </div>
                            <h3 className="font-semibold mt-0.5">{p.model}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                              <span className="text-xs font-semibold text-foreground bg-muted/40 px-2 py-0.5 rounded-md">À vista: {brl(Number(p.price))}</span>
                              {(() => {
                                const inst = getProductInstallmentInfo(p);
                                if (!inst) return null;
                                return (
                                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                    {inst.maxInstallments}x de {brl(inst.installmentValue)} {inst.hasSurcharge ? `(Total ${brl(inst.totalPrice)})` : "sem acréscimo"}
                                  </span>
                                );
                              })()}
                              {Number((p as any).down_payment_amount) > 0 && (
                                <span className="text-xs font-medium text-primary">
                                  Sinal: {brl(Number((p as any).down_payment_amount))}
                                </span>
                              )}
                              {Number((p as any).cost_price) > 0 && (
                                <span className="text-xs font-medium text-success">
                                  Lucro: {brl(Number(p.price) - Number((p as any).cost_price))}
                                </span>
                              )}
                              {/* Ajuste Rápido de Estoque (+/-) */}
                              <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/20 px-1 py-0.5" title="Ajuste rápido de estoque">
                                <button
                                  type="button"
                                  disabled={p.stock <= 0}
                                  onClick={() => handleQuickStock(p, -1)}
                                  className="size-5 flex items-center justify-center rounded hover:bg-muted font-bold text-xs disabled:opacity-30 transition-colors"
                                  title="Diminuir 1 unidade"
                                >
                                  -
                                </button>
                                <span className="text-xs font-semibold px-2 min-w-[36px] text-center font-mono" title={`Estoque total: ${getProductTotalStock(p)} unidades no total`}>
                                  {p.stock} de {getProductTotalStock(p)} un
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuickStock(p, 1)}
                                  className="size-5 flex items-center justify-center rounded hover:bg-muted font-bold text-xs transition-colors"
                                  title="Aumentar 1 unidade"
                                >
                                  +
                                </button>
                              </div>

                              {p.stock === 0 ? (
                                <span className="text-xs font-medium text-destructive">Esgotado</span>
                              ) : p.stock <= 2 ? (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Últimas unidades!</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              disabled={!p.is_open || p.stock <= 0}
                              onClick={() => handleReserveUnidade(p)}
                              className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
                              title="Fazer reserva para cliente nesta unidade"
                            >
                              <BookmarkCheck className="size-3.5" />
                              <span>Reservar para cliente</span>
                            </Button>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1">
                              <Switch checked={p.is_open} onCheckedChange={() => toggleOpen(p)} />
                              {p.is_open ? "Aberta" : "Fechada"}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              title={isProntaEntrega(p) ? "Editar item a pronta entrega" : "Editar pré-venda"}
                              onClick={() => setEditingProduct(p)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Duplicar miniatura"
                              onClick={() => handleDuplicateProduct(p)}
                            >
                              <CopyPlus className="size-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Copiar link"
                              onClick={() => {
                                const fullUrl = `${getStoreFullUrl(store.slug).replace(/\/$/, '')}/${p.slug || p.id}`;
                                navigator.clipboard.writeText(fullUrl);
                                toast.success("Link do produto copiado!");
                              }}
                            >
                              <Share2 className="size-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(p)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}

            {displayedProducts.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {mode === "pronta_entrega"
                  ? "Nenhuma miniatura a pronta entrega cadastrada ainda."
                  : mode === "pre_venda"
                    ? "Nenhuma pré-venda cadastrada ainda."
                    : "Nenhuma miniatura cadastrada ainda."}
              </p>
            )}
          </div>
        </div>

      <EditProductDialog
        product={editingProduct}
        storeId={store.id}
        userId={userId}
        onClose={() => setEditingProduct(null)}
      />

      <ManualReservationDialog
        storeId={store.id}
        storeColor={store.primary_color}
        storePixKey={(store as any).pix_key}
        products={products}
        open={manualDialogOpen}
        preSelectedProduct={manualReservationProduct}
        onClose={() => {
          setManualDialogOpen(false);
          setManualReservationProduct(null);
        }}
        onSuccess={() => {
          setManualDialogOpen(false);
          setManualReservationProduct(null);
          onSelectTab?.("reservas");
        }}
      />

      {isBlingEligible && (
        <BlingIntegrationDialog
          storeId={store.id}
          storeName={store.name}
          open={blingOpen}
          onOpenChange={setBlingOpen}
        />
      )}
    </>
  );
}

function EditProductDialog({
  product,
  storeId,
  userId,
  onClose,
}: {
  product: Product | null;
  storeId?: string;
  userId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    brand: "",
    model: "",
    scale: "1:64",
    price: "",
    cost_price: "",
    max_installments: "1",
    has_surcharge: "false",
    installment_price: "",
    down_payment_amount: "",
    release_date: "",
    stock: "1",
    payment_deadline_date: "",
    payment_deadline_hours: "24",
    is_open: true,
    image_url: "",
    bulk_discount_threshold: "",
    bulk_discount_price: "",
    bulk_has_installment_surcharge: "false",
    bulk_installment_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  const configuredBrands = useMemo(() => getStoreBrands(product?.store_id || storeId || ""), [product?.store_id, storeId]);
  const availableBrandOptions = useMemo(() => {
    const set = new Set([...configuredBrands]);
    if (product?.brand) set.add(product.brand.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configuredBrands, product?.brand]);

  useEffect(() => {
    if (product) {
      const rawVal = (product as any).down_payment_amount;
      const rawMaxInst = (product as any).max_installments;
      const rawPrice2x = (product as any).price_2x;
      const rawInstPrice = (product as any).installment_price ?? rawPrice2x;
      const rawHasSurcharge = (product as any).has_installment_surcharge ?? (rawInstPrice != null && Number(rawInstPrice) > Number(product.price));
      const rawDeadlineDate = (product as any).payment_deadline_date;
      const isPronta = isProntaEntrega(product);
      const noSignal = hasNoSignalRequirement(product);
      setForm({
        brand: product.brand ?? "",
        model: product.model ?? "",
        scale: product.scale ?? "1:64",
        price: product.price != null ? String(product.price) : "",
        cost_price: (product as any).cost_price != null ? String((product as any).cost_price) : "",
        max_installments: rawMaxInst != null ? String(rawMaxInst) : "1",
        has_surcharge: rawHasSurcharge ? "true" : "false",
        installment_price: rawInstPrice != null ? String(rawInstPrice) : "",
        down_payment_amount: rawVal != null && Number(rawVal) > 0 ? String(rawVal) : "",
        signal_rule: noSignal ? "sem_sinal" : "aguardando_sinal",
        release_date: product.release_date ? product.release_date.substring(0, 7) : "",
        stock: product.stock != null ? String(product.stock) : "1",
        payment_deadline_date: rawDeadlineDate ?? "",
        payment_deadline_hours: product.payment_deadline_hours != null ? String(product.payment_deadline_hours) : "24",
        is_open: product.is_open ?? true,
        image_url: product.image_url ?? "",
        category: isPronta ? "pronta_entrega" : ((product as any).category || "pre_venda"),
        bulk_discount_threshold: (product as any).bulk_discount_threshold != null ? String((product as any).bulk_discount_threshold) : "",
        bulk_discount_price: (product as any).bulk_discount_price != null ? String((product as any).bulk_discount_price) : "",
        bulk_has_installment_surcharge: (product as any).bulk_has_installment_surcharge ? "true" : "false",
        bulk_installment_price: (product as any).bulk_installment_price != null ? String((product as any).bulk_installment_price) : "",
        badge: getProductBadge(product.id),
      } as any);
      setIsCustomBrand(false);
    }
  }, [product]);

  if (!product) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    if (!form.brand.trim()) {
      return toast.error("Por favor, informe a marca da miniatura.");
    }

    setSaving(true);
    const isPronta = (form as any).category === "pronta_entrega";
    const isSemSinal = isPronta || (form as any).signal_rule === "sem_sinal";
    let computedHours = 24;
    if (isSemSinal) {
      computedHours = 0;
    } else if (form.payment_deadline_date) {
      const targetDate = new Date(form.payment_deadline_date + "T23:59:59");
      computedHours = Math.max(0, Math.round((targetDate.getTime() - Date.now()) / (1000 * 60 * 60)));
    } else if (form.down_payment_amount === "" || Number(form.down_payment_amount || 0) === 0) {
      computedHours = 0;
    }

    const maxInst = Number(form.max_installments || 1);
    const hasSurcharge = maxInst > 1 && form.has_surcharge === "true";
    const instPrice = maxInst > 1 ? (hasSurcharge && form.installment_price ? Number(form.installment_price) : Number(form.price || 0)) : null;

    const newStock = Number(form.stock || 0);
    const currentStock = product.stock ?? 0;
    const currentInitial = (product as any).initial_stock ?? currentStock;
    const stockDelta = newStock - currentStock;
    const newInitial = Math.max(newStock, currentInitial + stockDelta);

    const payload: any = {
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      max_installments: maxInst,
      has_installment_surcharge: hasSurcharge,
      installment_price: instPrice,
      price_2x: maxInst === 2 ? instPrice : null,
      release_date: isPronta ? null : (form.release_date ? (form.release_date.length === 7 ? form.release_date + "-01" : form.release_date) : null),
      payment_deadline_date: isSemSinal ? null : (form.payment_deadline_date || null),
      payment_deadline_hours: isSemSinal ? 0 : computedHours,
      down_payment_amount: isSemSinal || form.down_payment_amount === "" ? null : Number(form.down_payment_amount || 0),
      stock: newStock,
      initial_stock: newInitial,
      is_open: form.is_open,
      image_url: form.image_url || null,
      slug: slugify(`${form.brand.trim()}-${form.model.trim()}`),
      bulk_discount_threshold: (form as any).bulk_discount_threshold ? Number((form as any).bulk_discount_threshold) : null,
      bulk_discount_price: (form as any).bulk_discount_price ? Number((form as any).bulk_discount_price) : null,
      bulk_has_installment_surcharge: (form as any).bulk_has_installment_surcharge === "true",
      bulk_installment_price: (form as any).bulk_has_installment_surcharge === "true" && (form as any).bulk_installment_price ? Number((form as any).bulk_installment_price) : null,
    };

    let { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", product.id);

    // Fallbacks progressivos para lidar com colunas ausentes no banco
    if (error && (error.code === "PGRST204" || error.message?.includes("initial_stock") || (error as any).status === 400)) {
      delete (payload as any).initial_stock;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("bulk_discount") || error.message?.includes("bulk_has_installment_surcharge") || error.message?.includes("bulk_installment_price") || (error as any).status === 400)) {
      delete payload.bulk_discount_threshold;
      delete payload.bulk_discount_price;
      delete payload.bulk_has_installment_surcharge;
      delete payload.bulk_installment_price;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("cost_price") || (error as any).status === 400)) {
      delete payload.cost_price;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("max_installments") || error.message?.includes("has_installment_surcharge") || (error as any).status === 400)) {
      delete payload.max_installments;
      delete payload.price_2x;
      delete payload.installment_price;
      delete payload.has_installment_surcharge;
      const retry1 = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry1.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("payment_deadline_date") || (error as any).status === 400)) {
      delete payload.payment_deadline_date;
      const retry2 = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry2.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("down_payment_amount") || (error as any).status === 400)) {
      delete payload.down_payment_amount;
      const retry3 = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry3.error;
    }

    setSaving(false);
    if (error) {
      console.error("Erro ao editar miniatura:", error);
      return toast.error(`Não foi possível salvar as alterações: ${error.message || "Erro de permissão"}`);
    }

    saveProductCategory(product.id, isPronta ? "pronta_entrega" : "pre_venda");
    const explicitBadge = (form as any).badge;
    const effectiveBadge = explicitBadge !== undefined ? explicitBadge : (isPronta ? "Pronta Entrega" : "");
    saveProductBadge(product.id, effectiveBadge);

    queryClient.invalidateQueries({ queryKey: ["store-products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["store-orders"] });
    toast.success(isPronta ? "Item a pronta entrega atualizado!" : "Miniatura atualizada com sucesso!");
    onClose();
  }

  async function onFile(file: File) {
    try {
      const url = await uploadImage(userId, file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Foto da miniatura enviada!");
    } catch {
      toast.error("Falha ao enviar a foto.");
    }
  }

  const isProntaMode = (form as any).category === "pronta_entrega";

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-border/30 bg-card/90 max-h-[85vh] overflow-y-auto pr-3">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            {isProntaMode ? (
              <>
                <Zap className="size-5 text-emerald-500" />
                <span>Editar pronta entrega</span>
              </>
            ) : (
              <span>Editar pré-venda</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Tipo de Anúncio</Label>
            <Select
              value={(form as any).category || "pre_venda"}
              onValueChange={(val) => {
                const isP = val === "pronta_entrega";
                const currentBadge = (form as any).badge;
                let nextBadge = currentBadge;
                if (isP) {
                  if (!currentBadge || currentBadge === "__none") {
                    nextBadge = "Pronta Entrega";
                  }
                } else {
                  if (currentBadge === "Pronta Entrega") {
                    nextBadge = "";
                  }
                }
                setForm({
                  ...form,
                  category: val,
                  signal_rule: isP ? "sem_sinal" : ((form as any).signal_rule || "aguardando_sinal"),
                  down_payment_amount: isP ? "" : form.down_payment_amount,
                  badge: nextBadge,
                } as any);
              }}
            >
              <SelectTrigger className="bg-muted/20 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pre_venda">📦 Pré-venda (Lançamento / Chegada Futura)</SelectItem>
                <SelectItem value="pronta_entrega">⚡ Pronta Entrega (Envio Imediato)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand" className="text-xs font-medium text-muted-foreground">Marca</Label>
              <Select
                value={
                  isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))
                    ? "__custom"
                    : form.brand
                }
                onValueChange={(val) => {
                  if (val === "__custom") {
                    setIsCustomBrand(true);
                    setForm((f) => ({ ...f, brand: "" }));
                  } else {
                    setIsCustomBrand(false);
                    setForm((f) => ({ ...f, brand: val }));
                  }
                }}
              >
                <SelectTrigger id="edit-brand" className="bg-muted/20 border-border/30">
                  <SelectValue placeholder="Selecione a marca" />
                </SelectTrigger>
                <SelectContent>
                  {availableBrandOptions.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom" className="font-semibold text-primary">+ Outra marca...</SelectItem>
                </SelectContent>
              </Select>
              {(isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))) && (
                <Input
                  placeholder="Digite a nova marca..."
                  maxLength={40}
                  required
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="mt-1.5 text-xs sm:text-sm bg-muted/20 border-border/30"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-scale" className="text-xs font-medium text-muted-foreground">Escala</Label>
              <Input
                id="edit-scale"
                maxLength={12}
                value={form.scale}
                onChange={(e) => setForm({ ...form, scale: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="edit-model" className="text-xs font-medium text-muted-foreground">Modelo</Label>
              <Input
                id="edit-model"
                required
                maxLength={80}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-badge" className="text-xs font-medium text-muted-foreground">Selo (Badge)</Label>
              <Select
                value={(form as any).badge || "__none"}
                onValueChange={(val) => setForm({ ...form, badge: val === "__none" ? "" : val } as any)}
              >
                <SelectTrigger id="edit-badge" className="bg-muted/20 border-border/30">
                  <SelectValue placeholder="Selo..." />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_BADGES.map((b) => (
                    <SelectItem key={b.value || "__none"} value={b.value || "__none"}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cost-price" className="text-xs font-medium text-muted-foreground">Custo (R$)</Label>
              <Input
                id="edit-cost-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 150"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-price" className="text-xs font-medium text-muted-foreground">Venda (R$)</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            {!isProntaMode && (
              <div className="space-y-1.5 flex flex-col justify-end">
                <Label htmlFor="edit-signal-rule" className="text-xs font-medium text-muted-foreground whitespace-nowrap">Exigência Sinal</Label>
                <Select 
                  value={(form as any).signal_rule || "aguardando_sinal"} 
                  onValueChange={(val) => {
                    if (val === 'sem_sinal') {
                      setForm({ ...form, signal_rule: 'sem_sinal', down_payment_amount: '', payment_deadline_date: '', payment_deadline_hours: '0' } as any);
                    } else {
                      setForm({ ...form, signal_rule: 'aguardando_sinal', payment_deadline_hours: '24' } as any);
                    }
                  }}
                >
                  <SelectTrigger id="edit-signal-rule" className="h-9 text-xs bg-muted/20 border-border/30 w-full text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aguardando_sinal">Obrigatório</SelectItem>
                    <SelectItem value="sem_sinal">Não obrigatório (Na chegada)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isProntaMode && ((form as any).signal_rule !== 'sem_sinal') && (
              <div className="space-y-1.5 flex flex-col justify-end">
                <Label htmlFor="edit-down-payment" className="text-xs font-medium text-muted-foreground">Sinal (R$)</Label>
                <Input
                  id="edit-down-payment"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 50 (Padrão 20%)"
                  value={form.down_payment_amount}
                  onChange={(e) => setForm({ ...form, down_payment_amount: e.target.value })}
                  className="bg-muted/20 border-border/30 h-9"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-stock" className="text-xs font-medium text-muted-foreground">Unidades</Label>
              <Input
                id="edit-stock"
                type="number"
                min="0"
                required
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Desconto por Quantidade (Atacado)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit_bulk_threshold" className="text-xs font-medium text-muted-foreground">A partir de (unidades)</Label>
                <Input
                  id="edit_bulk_threshold"
                  type="number"
                  min="2"
                  placeholder="Ex: 3"
                  value={(form as any).bulk_discount_threshold}
                  onChange={(e) => setForm({ ...form, bulk_discount_threshold: e.target.value } as any)}
                  className="bg-muted/20 border-border/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_bulk_price" className="text-xs font-medium text-muted-foreground">Novo Valor Unitário (R$)</Label>
                <Input
                  id="edit_bulk_price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 180"
                  value={(form as any).bulk_discount_price}
                  onChange={(e) => setForm({ ...form, bulk_discount_price: e.target.value } as any)}
                  className="bg-muted/20 border-border/30"
                />
              </div>
            </div>

            {Number(form.max_installments) > 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento (Atacado)</Label>
                    <Select
                      value={(form as any).bulk_has_installment_surcharge}
                      onValueChange={(val) => setForm({ ...form, bulk_has_installment_surcharge: val } as any)}
                    >
                      <SelectTrigger className="bg-muted/20 border-border/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                        <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(form as any).bulk_has_installment_surcharge === "true" && (
                  <div className="space-y-1.5 pt-1 mt-3">
                    <Label htmlFor="edit_bulk_inst_price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado no Atacado (R$)</Label>
                    <Input
                      id="edit_bulk_inst_price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 200"
                      value={(form as any).bulk_installment_price}
                      onChange={(e) => setForm({ ...form, bulk_installment_price: e.target.value } as any)}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border/30 bg-muted/15 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Máximo de parcelas</Label>
                <Select
                  value={form.max_installments}
                  onValueChange={(val) => setForm({ ...form, max_installments: val })}
                >
                  <SelectTrigger className="bg-muted/20 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x (Apenas à vista)</SelectItem>
                    <SelectItem value="2">Até 2x</SelectItem>
                    <SelectItem value="3">Até 3x</SelectItem>
                    <SelectItem value="4">Até 4x</SelectItem>
                    <SelectItem value="5">Até 5x</SelectItem>
                    <SelectItem value="6">Até 6x</SelectItem>
                    <SelectItem value="10">Até 10x</SelectItem>
                    <SelectItem value="12">Até 12x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {Number(form.max_installments) > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento</Label>
                  <Select
                    value={form.has_surcharge}
                    onValueChange={(val) => setForm({ ...form, has_surcharge: val })}
                  >
                    <SelectTrigger className="bg-muted/20 border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                      <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {Number(form.max_installments) > 1 && (
              <div>
                {form.has_surcharge === "true" ? (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="edit-inst-price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado (R$)</Label>
                    <Input
                      id="edit-inst-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 260"
                      value={form.installment_price}
                      onChange={(e) => setForm({ ...form, installment_price: e.target.value })}
                      className="bg-muted/20 border-border/30"
                    />
                    {Number(form.installment_price) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.installment_price) / Number(form.max_installments))}</strong> (com acréscimo)
                      </p>
                    )}
                  </div>
                ) : (
                  Number(form.price) > 0 && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.price) / Number(form.max_installments))}</strong> sem acréscimo.
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          {!isProntaMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-release" className="text-xs font-medium text-muted-foreground">Data estimada</Label>
                <Input
                  id="edit-release"
                  type="month"
                  value={form.release_date}
                  onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                  className="bg-muted/20 border-border/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-signal-deadline" className="text-xs font-medium text-muted-foreground">Data limite para o sinal</Label>
                <Input
                  id="edit-signal-deadline"
                  type="date"
                  value={form.payment_deadline_date}
                  onChange={(e) => setForm({ ...form, payment_deadline_date: e.target.value })}
                  className="bg-muted/20 border-border/30"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between py-1">
            <Label htmlFor="edit-open" className="text-xs font-medium text-muted-foreground">Status da pré-venda</Label>
            <div className="flex items-center gap-2 text-xs">
              <Switch
                id="edit-open"
                checked={form.is_open}
                onCheckedChange={(checked) => setForm({ ...form, is_open: checked })}
              />
              <span className="text-muted-foreground">{form.is_open ? "Aberta" : "Fechada"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-photo" className="text-xs font-medium text-muted-foreground">Foto da miniatura</Label>
            <Input
              id="edit-photo"
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              className="bg-muted/20 border-border/30"
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Foto da miniatura"
                className="mt-2 h-16 w-full rounded-lg object-cover border border-border/30"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

