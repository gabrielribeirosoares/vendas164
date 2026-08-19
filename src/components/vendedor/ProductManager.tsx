import { BookmarkCheck, CopyPlus } from "lucide-react";
import { formatDeadlineHours, getInstallmentOptions, getProductInstallmentInfo, hasNoSignalRequirement } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/PhoneInput";
import { getCustomerFromCache, saveCustomerToCache } from "@/lib/customerCache";
import { getProductBadge, saveProductBadge, PRESET_BADGES } from "@/lib/storeCustomizations";
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
import { useSession } from "@/lib/session";
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
};

export function ProductsTab({
  store,
  products,
  userId,
  onSelectTab,
}: {
  store: Store;
  products: Product[];
  userId: string;
  onSelectTab?: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...emptyProduct });
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualReservationProduct, setManualReservationProduct] = useState<Product | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const configuredBrands = useMemo(() => getStoreBrands(store.id), [store.id]);
  const availableBrandOptions = useMemo(() => {
    const set = new Set([...configuredBrands]);
    products.forEach((p) => p.brand && set.add(p.brand.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configuredBrands, products]);

  const brandsMap: Record<string, Product[]> = {};
  for (const p of products) {
    const brandName = (p.brand || "Outros").trim();
    if (!brandsMap[brandName]) brandsMap[brandName] = [];
    brandsMap[brandName].push(p);
  }
  const brandList = Object.keys(brandsMap).sort((a, b) => a.localeCompare(b));
  const filteredBrands = selectedBrand === "all" ? brandList : brandList.filter((b) => b === selectedBrand);

  function handleReserveUnidade(p: Product) {
    if (!p.is_open) return toast.error("Esta pré-venda está fechada.");
    if (p.stock <= 0) return toast.error("Não há unidades disponíveis para esta miniatura.");

    setManualReservationProduct(p);
    setManualDialogOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim()) {
      return toast.error("Por favor, selecione ou informe a marca da miniatura.");
    }

    const isSemSinal = (form as any).signal_rule === "sem_sinal";
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
      release_date: form.release_date ? (form.release_date.length === 7 ? form.release_date + "-01" : form.release_date) : null,
      payment_deadline_date: isSemSinal ? null : (form.payment_deadline_date || null),
      payment_deadline_hours: isSemSinal ? 0 : computedHours,
      down_payment_amount: isSemSinal || form.down_payment_amount === "" ? null : Number(form.down_payment_amount || 0),
      stock: Number(form.stock || 0),
      initial_stock: Number(form.stock || 0),
      image_url: form.image_url || null,
      slug: slugify(form.model.trim()),
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

    if ((form as any).badge) {
      // Tenta pegar o último produto criado pela loja para salvar o badge
      const { data: latest } = await supabase.from("products").select("id").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest) {
        saveProductBadge(latest.id, (form as any).badge);
      }
    }

    setForm({ ...emptyProduct });
    setSheetOpen(false);
    setIsCustomBrand(false);
    queryClient.invalidateQueries();
    toast.success("Pré-venda cadastrada!");
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
      {/* Sheet lateral com o formulário */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-semibold">Nova pré-venda</SheetTitle>
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
                {((form as any).signal_rule !== 'sem_sinal') && (
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
                {saving && <Loader2 className="size-4 animate-spin" />} Publicar pré-venda
              </Button>
            </form>
          </SheetContent>
        </Sheet>

      {/* Catálogo em tela cheia */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-lg tracking-tight">Catálogo da Loja ({products.length})</h3>
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
                  Todas ({products.length})
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
            <Button
              type="button"
              size="sm"
              onClick={() => { setForm({ ...emptyProduct }); setIsCustomBrand(false); setSheetOpen(true); }}
              className="gap-1.5"
            >
              <Plus className="size-4" /> Nova pré-venda
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
                            <p className="text-xs text-muted-foreground">
                              {p.brand} · {p.scale} · {
                                (p as any).payment_deadline_date
                                  ? `sinal até ${new Date((p as any).payment_deadline_date + "T00:00:00").toLocaleDateString("pt-BR")}`
                                  : Number(p.payment_deadline_hours) > 0
                                    ? `sinal em ${formatDeadlineHours(p.payment_deadline_hours)}`
                                    : "sem sinal"
                              }
                            </p>
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
                              title="Editar pré-venda"
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
                                navigator.clipboard.writeText(`${window.location.origin}/produto/${p.id}`);
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

            {products.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">Nenhuma miniatura cadastrada ainda.</p>
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
    const isSemSinal = (form as any).signal_rule === "sem_sinal";
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
      release_date: form.release_date ? (form.release_date.length === 7 ? form.release_date + "-01" : form.release_date) : null,
      payment_deadline_date: isSemSinal ? null : (form.payment_deadline_date || null),
      payment_deadline_hours: isSemSinal ? 0 : computedHours,
      down_payment_amount: isSemSinal || form.down_payment_amount === "" ? null : Number(form.down_payment_amount || 0),
      stock: newStock,
      initial_stock: newInitial,
      is_open: form.is_open,
      image_url: form.image_url || null,
      slug: slugify(form.model.trim()),
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
    saveProductBadge(product.id, (form as any).badge || "");
    queryClient.invalidateQueries({ queryKey: ["store-products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["store-orders"] });
    toast.success("Miniatura atualizada com sucesso!");
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

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-border/30 bg-card/90 max-h-[85vh] overflow-y-auto pr-3">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Editar pré-venda</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
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
            {((form as any).signal_rule !== 'sem_sinal') && (
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

interface ManualReservationDialogProps {
  storeId: string;
  storeColor?: string;
  storePixKey?: string | null;
  products: Product[];
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preSelectedProduct?: Product | null;
}

export function ManualReservationDialog({
  storeId,
  storeColor,
  storePixKey,
  products,
  open,
  onClose,
  onSuccess,
  preSelectedProduct,
}: ManualReservationDialogProps) {
  const themeColor = storeColor || "#e11d48";
  const { user: currentUser } = useSession();
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedClientMode, setSelectedClientMode] = useState<"existing" | "new">("new");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("aguardando_sinal");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);


  // Buscar dados da loja para extrair a Chave PIX cadastrada
  const { data: storeInfo } = useQuery({
    queryKey: ["store-pix-info", storeId],
    enabled: open && !!storeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("pix_key, whatsapp_number")
        .eq("id", storeId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (open) {
      const initialPix = storePixKey || storeInfo?.pix_key || storeInfo?.whatsapp_number || "";
      setPixKey(initialPix);
    }
  }, [open, storePixKey, storeInfo]);

  // Buscar lista de clientes que seguem ou reservaram NETA loja (excluindo o próprio lojista)
  const { data: storeCustomers } = useQuery({
    queryKey: ["store-followers-customers", storeId, currentUser?.id],
    enabled: open && !!storeId,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("customer_store_link")
        .select("user_id")
        .eq("store_id", storeId);

      const { data: orders } = await supabase
        .from("orders")
        .select("user_id")
        .eq("store_id", storeId);

      const followerUserIds = Array.from(
        new Set([
          ...(links ?? []).map((l) => l.user_id),
          ...(orders ?? []).map((o: any) => o.user_id),
        ])
      ).filter((id) => id !== currentUser?.id);

      if (!followerUserIds.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email, phone")
        .in("id", followerUserIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      return followerUserIds.map((id) => {
        const p = profileMap.get(id);
        const cached = getCustomerFromCache(id);

        const rawName = (p?.name && p.name !== "Cliente" && p.name !== "Cliente cadastrado" ? p.name : cached?.name) || "";
        const email = (p?.email?.trim() || cached?.email) || "";
        const phone = (p?.phone?.trim() || cached?.phone) || "";

        const isGeneric = !rawName || rawName === "Cliente" || rawName === "Cliente cadastrado";
        const displayName = !isGeneric
          ? rawName
          : email
            ? email
            : phone
              ? `Cliente · ${phone}`
              : "Cliente sem nome registrado";

        return {
          id,
          name: displayName,
          rawName: rawName || "",
          email: email || null,
          phone: phone || null,
        };
      });
    },
  });

  const [manualQuantity, setManualQuantity] = useState<number>(1);

  useEffect(() => {
    if (preSelectedProduct) {
      setSelectedProductId(preSelectedProduct.id);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [preSelectedProduct, products, open]);

  useEffect(() => {
    if (selectedProductId && products.length > 0) {
      const p = products.find((prod) => prod.id === selectedProductId);
      if (p) {
        if (hasNoSignalRequirement(p)) {
          setPaymentStatus("sem_sinal");
        } else {
          setPaymentStatus("aguardando_sinal");
        }
      }
    }
  }, [selectedProductId, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProductId) return toast.error("Selecione uma pré-venda.");
    if (!clientName.trim()) return toast.error("Informe o nome do cliente.");
    if (!clientPhone.trim()) return toast.error("Informe o WhatsApp do cliente.");

    const cleanPhone = clientPhone.trim();
    const cleanName = clientName.trim();
    let clientId = selectedUserId;

    if (clientId === currentUser?.id) {
      return toast.error("Você é o dono da loja e não pode criar reservas em seu próprio nome. Escolha ou informe os dados de um cliente.");
    }

    // Se o lojista não selecionou da lista, tenta encontrar o cadastro do cliente pelo telefone ou email
    if (!clientId) {
      const cleanPhoneDigits = cleanPhone.replace(/\D/g, "");
      const { data: foundProf } = await supabase
        .from("profiles")
        .select("id, phone")
        .or(`phone.eq.${cleanPhone},phone.eq.55${cleanPhoneDigits},phone.eq.${cleanPhoneDigits}`)
        .maybeSingle();

      if (foundProf) {
        clientId = foundProf.id;
      } else {
        const { data: profilesList } = await supabase
          .from("profiles")
          .select("id, phone")
          .not("phone", "is", null);

        if (profilesList && profilesList.length > 0) {
          const found = profilesList.find((p) => {
            if (!p.phone) return false;
            const pDigits = p.phone.replace(/\D/g, "");
            return cleanPhoneDigits.length >= 8 && pDigits.length >= 8 &&
              (cleanPhoneDigits.slice(-8) === pDigits.slice(-8) || cleanPhoneDigits === pDigits);
          });
          if (found) {
            clientId = found.id;
          }
        }
      }

      // Se ainda não existir perfil cadastrado, insere um perfil convidado temporário na tabela profiles
      if (!clientId) {
        const guestId = crypto.randomUUID();
        const { error: profErr } = await supabase.from("profiles").insert({
          id: guestId,
          name: cleanName,
          phone: cleanPhone,
        });

        if (!profErr) {
          clientId = guestId;
        }
      }
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return toast.error("Pré-venda não encontrada.");
    if (product.stock <= 0) return toast.error("Unidades esgotadas para esta pré-venda.");

    const qtyToCreate = Math.min(manualQuantity, product.stock);
    if (qtyToCreate <= 0) return toast.error("Quantidade inválida.");

    setSaving(true);
    try {
      // 1. Salvar os dados do cliente no cache local da loja
      saveCustomerToCache({ id: clientId, name: cleanName, phone: cleanPhone });



      // 3. Atualizar perfil do cliente no Supabase se existir (sem travar se RLS negar)
      try {
        const { data: existingProf } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", clientId)
          .maybeSingle();

        if (existingProf) {
          await supabase
            .from("profiles")
            .update({ name: cleanName, phone: cleanPhone })
            .eq("id", clientId);
        }
      } catch {
        // Ignora erros de RLS
      }

      // 4. Calcular preços unitários
      const cashPrice = Number(product.price);
      const instOptions = getInstallmentOptions(product);
      const chosenOption = instOptions.find((o: any) => o.value === installmentCount) ?? instOptions[0];
      const totalPrice = installmentCount > 1 ? chosenOption.totalPrice : cashPrice;
      
      const customSignal = Number((product as any).down_payment_amount || 0);
      let downPayment = 0;

      if (paymentStatus === "sinal_pago") {
        downPayment = customSignal > 0 ? customSignal : Math.round(cashPrice * 0.2 * 100) / 100;
      } else if (paymentStatus === "quitado") {
        downPayment = totalPrice;
      } else if (paymentStatus === "sem_sinal") {
        downPayment = 0;
      } else if (paymentStatus === "aguardando_sinal") {
        downPayment = 0;
      }

      let expiresAt: string | null = null;
      if (paymentStatus === "aguardando_sinal") {
        if ((product as any).payment_deadline_date) {
          expiresAt = new Date((product as any).payment_deadline_date + "T23:59:59").toISOString();
        } else if ((product as any).payment_deadline_hours && Number((product as any).payment_deadline_hours) > 0) {
          expiresAt = new Date(Date.now() + Number((product as any).payment_deadline_hours) * 3600 * 1000).toISOString();
        } else {
          expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
      }

      // 5. Inserir as reservas no banco
      const isRegisteredUser = Boolean(clientId && clientId !== currentUser?.id);
      const effectiveUserId = clientId || currentUser!.id;
      const guestKeyString = !isRegisteredUser
        ? `GUEST:${JSON.stringify({ name: cleanName, phone: cleanPhone, pix: pixKey.trim() || null })}`
        : (pixKey.trim() || null);

      for (let i = 0; i < qtyToCreate; i++) {
        const orderPayload: any = {
          store_id: storeId,
          product_id: product.id,
          user_id: effectiveUserId,
          total_price: totalPrice,
          down_payment: downPayment,
          payment_status: paymentStatus,
          reservation_expires_at: expiresAt,
        };

        if (installmentCount > 1) {
          orderPayload.installment_count = installmentCount;
        }
        if (guestKeyString) {
          orderPayload.pix_key = guestKeyString;
        }

        let { data: insertedOrder, error: orderErr } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select("id")
          .single();

        // Fallback se .select().single() não retornar ou se houver erro pontual de coluna
        if (orderErr) {
          if (orderErr.message?.includes("installment_count") || orderErr.code === "PGRST204") {
            delete orderPayload.installment_count;
          }
          const retry = await supabase.from("orders").insert(orderPayload).select("id").maybeSingle();
          orderErr = retry.error;
          if (retry.data?.id) {
            saveCustomerToCache({ id: retry.data.id, name: cleanName, phone: cleanPhone });
          }
        } else if (insertedOrder?.id) {
          saveCustomerToCache({ id: insertedOrder.id, name: cleanName, phone: cleanPhone });
        }

        if (orderErr) throw orderErr;
      }

      // 6. Abater estoque com concorrência segura (RPC reservar_miniatura com FOR UPDATE)
      const { data: rpcOk, error: rpcError } = await supabase.rpc("reservar_miniatura", {
        p_produto_id: product.id,
        p_quantidade: qtyToCreate,
      });

      if (rpcError || rpcOk === false) {
        await supabase
          .from("products")
          .update({ stock: Math.max(0, product.stock - qtyToCreate) })
          .eq("id", product.id);
      }

      // O vínculo de cliente com a loja já é garantido pela tabela 'orders' (store_id e user_id)

      queryClient.invalidateQueries();
      toast.success(qtyToCreate > 1 ? `${qtyToCreate} unidades vinculadas ao cliente ${cleanName}!` : `Reserva vinculada ao cliente ${cleanName}!`);
      
      setClientName("");
      setClientPhone("");
      setSelectedUserId("");
      setInstallmentCount(1);
      setManualQuantity(1);
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error("Erro ao criar reserva manual:", err);
      toast.error("Não foi possível registrar a reserva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: any) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-border/30 bg-card/90 p-4 sm:p-6 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0 pb-3 border-b border-border/20">
          <DialogTitle className="text-lg sm:text-xl font-semibold">Nova Reserva para Cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4 min-w-0 overflow-y-auto pr-2.5 flex-1">
          <div className="space-y-2 min-w-0">
            <Label className="text-xs font-medium text-muted-foreground">Pré-venda / Miniatura</Label>
            <Select
              value={selectedProductId}
              onValueChange={(id) => {
                setSelectedProductId(id);
                setManualQuantity(1);
              }}
            >
              <SelectTrigger className="w-full text-xs sm:text-sm bg-muted/20 border-border/30">
                <SelectValue placeholder="Selecione a miniatura" className="truncate" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)] max-h-60">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.stock <= 0} className="text-xs sm:text-sm">
                    <span className="truncate block">
                      {p.brand} {p.model} ({p.stock} {p.stock === 1 ? "unidade" : "unidades"} em estoque — {brl(Number(p.price))})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantidade e Resumo de Valor */}
          {(() => {
            const selProd = products.find((p) => p.id === selectedProductId);
            if (!selProd) return null;
            const maxStock = Math.min(selProd.stock, 20);
            const unitPrice = Number(selProd.price || 0);
            const totalPrice = unitPrice * manualQuantity;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-xs">
                <div className="space-y-1">
                  <Label htmlFor="manual-qty" className="text-xs font-semibold text-muted-foreground">Quantidade de Unidades</Label>
                  <Select
                    value={String(manualQuantity)}
                    onValueChange={(v) => setManualQuantity(Number(v))}
                  >
                    <SelectTrigger id="manual-qty" className="h-8 bg-background border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxStock }, (_, i) => i + 1).map((q) => (
                        <SelectItem key={q} value={String(q)} className="text-xs">
                          {q} {q === 1 ? "unidade" : "unidades"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-center text-right">
                  <span className="text-[11px] text-muted-foreground">Valor Total da Reserva</span>
                  <span className="text-base font-bold text-primary">{brl(totalPrice)}</span>
                  {manualQuantity > 1 && (
                    <span className="text-[10px] text-muted-foreground font-mono">({manualQuantity}x {brl(unitPrice)})</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Seleção do Cliente (Já cadastrado vs Novo) */}
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label className="text-xs font-medium text-muted-foreground">Cliente</Label>
              <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-lg text-xs border border-border/20">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientMode("existing");
                    setSelectedUserId("");
                  }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    selectedClientMode === "existing"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cadastrado ({storeCustomers?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientMode("new");
                    setSelectedUserId("");
                  }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    selectedClientMode === "new"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Novo cliente
                </button>
              </div>
            </div>

            {selectedClientMode === "existing" && (
              <div className="relative">
                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => { setCustomerDropdownOpen(!customerDropdownOpen); setCustomerSearch(""); }}
                  className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-xs sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[2.5rem]"
                >
                  {selectedUserId && storeCustomers?.find((c) => c.id === selectedUserId) ? (
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="font-semibold text-foreground truncate block">
                        {storeCustomers.find((c) => c.id === selectedUserId)!.name}
                      </span>
                      {storeCustomers.find((c) => c.id === selectedUserId)!.phone && (
                        <span className="text-[11px] font-medium truncate block" style={{ color: themeColor }}>
                          📱 {storeCustomers.find((c) => c.id === selectedUserId)!.phone}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Selecione um cliente cadastrado...</span>
                  )}
                  <Search className="ml-2 size-4 shrink-0 opacity-50" />
                </button>

                {/* Dropdown */}
                {customerDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95">
                    {/* Search input */}
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <Search className="size-4 shrink-0 text-muted-foreground" />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Buscar por nome, e-mail ou WhatsApp..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="flex-1 bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>

                    {/* Customer list */}
                    <div className="max-h-52 overflow-y-auto">
                      {(() => {
                        const q = customerSearch.toLowerCase().trim();
                        const hasLetters = /[a-z]/i.test(q);
                        const qDigits = q.replace(/\D/g, "");

                        const filtered = (storeCustomers ?? []).filter((c) => {
                          if (!q) return true;
                          return (
                            c.name.toLowerCase().includes(q) ||
                            (c.rawName && c.rawName.toLowerCase().includes(q)) ||
                            (c.email && c.email.toLowerCase().includes(q)) ||
                            (c.phone && c.phone.toLowerCase().includes(q)) ||
                            (!hasLetters && qDigits.length > 0 && c.phone && c.phone.replace(/\D/g, "").includes(qDigits))
                          );
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className="p-3 text-xs text-muted-foreground text-center">
                              {storeCustomers?.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda nesta loja."}
                            </div>
                          );
                        }

                        return filtered.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedUserId(c.id);
                              const isGenericOrEmail = !c.rawName || c.rawName === "Cliente" || c.name.includes("@");
                              setClientName(isGenericOrEmail ? (c.email ? c.email.split("@")[0] : "") : c.name);
                              setClientPhone(c.phone || "");
                              setCustomerDropdownOpen(false);
                              setCustomerSearch("");
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/60 transition-colors ${
                              selectedUserId === c.id ? "bg-accent" : ""
                            }`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-foreground text-xs sm:text-sm truncate block">
                                {c.name}
                              </span>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0">
                                {c.email && c.name !== c.email && (
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {c.email}
                                  </span>
                                )}
                                {c.phone && (
                                  <span className="text-[11px] font-medium truncate" style={{ color: themeColor }}>
                                    📱 {c.phone}
                                  </span>
                                )}
                                {!c.rawName && !c.phone && (
                                  <span className="text-[11px] text-primary font-medium">
                                    Clique para definir Nome e WhatsApp
                                  </span>
                                )}
                              </div>
                            </div>
                            {selectedUserId === c.id && (
                              <span className="text-primary text-sm">✓</span>
                            )}
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Backdrop to close dropdown */}
                {customerDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => { setCustomerDropdownOpen(false); setCustomerSearch(""); }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 min-w-0">
            <Label htmlFor="manual-client-name" className="text-xs font-medium text-muted-foreground">Nome do Cliente</Label>
            <Input
              id="manual-client-name"
              required
              placeholder="Ex: João da Silva"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="text-xs sm:text-sm bg-muted/20 border-border/30"
            />
          </div>

          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="manual-client-phone" className="text-xs font-medium text-muted-foreground">WhatsApp do Cliente</Label>
              {selectedUserId && clientPhone && (
                <span className="text-[11px] text-success font-medium flex items-center gap-1">
                  ✓ Do cadastro
                </span>
              )}
            </div>
            <PhoneInput id="manual-client-phone" required value={clientPhone} onChange={setClientPhone} />
            {selectedUserId && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Este WhatsApp está vinculado à conta cadastrada do cliente e será sincronizado no perfil dele.
              </p>
            )}
          </div>

          <div className="space-y-2 min-w-0">
            <Label htmlFor="manual-pix-key" className="text-xs font-medium text-muted-foreground">Chave PIX da Loja (opcional)</Label>
            <Input
              id="manual-pix-key"
              placeholder="Ex: CPF, CNPJ, E-mail, Telefone ou Chave Aleatória"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              className="text-xs sm:text-sm font-mono bg-muted/20 border-border/30"
            />
          </div>

          <div className="space-y-2 min-w-0">
            <Label className="text-xs font-medium text-muted-foreground">Status do Pagamento</Label>
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger className="w-full text-xs sm:text-sm bg-muted/20 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)]">
                <SelectItem value="aguardando_sinal" className="text-xs sm:text-sm">Aguardando Sinal</SelectItem>
                <SelectItem value="sem_sinal" className="text-xs sm:text-sm">Sem sinal / Pagar na chegada</SelectItem>
                <SelectItem value="sinal_pago" className="text-xs sm:text-sm">Sinal Pago</SelectItem>
                <SelectItem value="quitado" className="text-xs sm:text-sm">Pago Total (Quitado)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Parcelamento */}
          {(() => {
            const selectedProduct = products.find((p) => p.id === selectedProductId);
            const instOptions = selectedProduct ? getInstallmentOptions(selectedProduct, manualQuantity) : [];
            if (instOptions.length <= 1) return null;
            const chosenOption = instOptions.find((o: any) => o.value === installmentCount) ?? instOptions[0];
            return (
              <div className="space-y-2 min-w-0">
                <Label className="text-xs font-medium text-muted-foreground">Condição de Pagamento</Label>
                <Select
                  value={String(installmentCount)}
                  onValueChange={(v) => setInstallmentCount(Number(v))}
                >
                  <SelectTrigger className="w-full text-xs sm:text-sm bg-muted/20 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-3rem)]">
                    {instOptions.map((opt: any) => (
                      <SelectItem key={opt.value} value={String(opt.value)} className="text-xs sm:text-sm">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {installmentCount > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Total da reserva: <strong className="text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(chosenOption.totalPrice)}</strong>
                  </p>
                )}
              </div>
            );
          })()}


          <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm flex justify-end gap-2 pt-3 pb-1 border-t border-border/20 mt-4 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-1" />} Confirmar Reserva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
