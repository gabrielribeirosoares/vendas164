import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Filter, Loader2, MessageCircle, Package, Palette, Pencil, Search, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader, updateAppFavicon } from "@/components/AppHeader";
import { PhoneInput, parsePhoneWithFlag } from "@/components/PhoneInput";
import { PaymentBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { brl, slugify, whatsappLink } from "@/lib/format";
import { useSession } from "@/lib/session";
import { uploadImage } from "@/lib/upload";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/vendedor")({
  head: () => ({
    meta: [
      { title: "Painel do lojista" },
      {
        name: "description",
        content:
          "Gerencie pré-vendas, cotas, sinais recebidos, saldo a receber e a identidade da sua loja.",
      },
      { property: "og:title", content: "Painel do lojista" },
      { property: "og:description", content: "Gestão completa de pré-vendas de miniaturas." },
    ],
  }),
  component: SellerDashboard,
});

type Store = Tables<"stores">;
type Product = Tables<"products">;

function SellerDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("produtos");

  const { data: store, isLoading } = useQuery({
    queryKey: ["my-store", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("owner_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["store-products", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["store-orders", store?.id],
    enabled: !!store,
    queryFn: async (): Promise<OrderRow[]> => {
      let { data, error } = await supabase
        .from("orders")
        .select("*, products(brand, model, price, image_url, down_payment_amount)")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });

      if (error) {
        const fallback = await supabase
          .from("orders")
          .select("*, products(brand, model, price, image_url)")
          .eq("store_id", store!.id)
          .order("created_at", { ascending: false });
        data = fallback.data;
        if (fallback.error) throw fallback.error;
      }
      const rows = data ?? [];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const { data: people } = userIds.length
        ? await supabase.from("profiles").select("id, name, email").in("id", userIds)
        : { data: [] };
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
    },
  });

  const totals = useMemo(() => {
    const active = (orders ?? []).filter((o) => o.payment_status !== "cancelado");
    const projected = active.reduce((s, o) => s + Number(o.total_price), 0);
    const received = active.reduce((s, o) => s + Number(o.down_payment), 0);
    return { projected, received, pending: projected - received };
  }, [orders]);

  useEffect(() => {
    if (store?.name) {
      if (activeTab === "reservas") {
        document.title = `${store.name} — Reservas`;
      } else if (activeTab === "loja") {
        document.title = `${store.name} — Personalização`;
      } else {
        document.title = `${store.name} — Estoque e pré-vendas`;
      }
    }
  }, [store?.name, activeTab]);

  if (sessionLoading || isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">
          Sessão não encontrada. Por favor, faça login novamente.
        </p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <CreateStore onCreated={() => queryClient.invalidateQueries()} userId={user.id} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader store={store} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{store.name}</h1>
            <p className="text-sm text-muted-foreground">/loja/{store.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "loja" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setActiveTab("loja")}
            >
              <Palette className="size-4" /> Personalizar Loja
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/auth?loja=${store.id}&next=/loja/${store.slug}`,
                );
                toast.success("Link de convite da loja copiado!");
              }}
            >
              <Copy className="size-4" /> Link de convite
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Valor total projetado" value={brl(totals.projected)} />
          <Stat label="Sinal recebido" value={brl(totals.received)} accent="text-success" />
          <Stat label="Saldo a receber" value={brl(totals.pending)} accent="text-warning" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
          <TabsList className="flex-wrap">
            <TabsTrigger value="produtos">Estoque e pré-vendas</TabsTrigger>
            <TabsTrigger value="reservas">Reservas</TabsTrigger>
            <TabsTrigger value="loja" className="gap-1.5">
              <Palette className="size-3.5" /> Personalização
            </TabsTrigger>
          </TabsList>

          <TabsContent value="produtos" className="mt-4">
            <ProductsTab store={store} products={products ?? []} userId={user!.id} />
          </TabsContent>

          <TabsContent value="reservas" className="mt-4">
            <OrdersTab orders={orders ?? []} />
          </TabsContent>

          <TabsContent value="loja" className="mt-4">
            <BrandingTab store={store} userId={user!.id} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="border-border/60 panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`font-display text-2xl font-bold ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function CreateStore({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = slugify(cleanName);
    if (!cleanSlug) return toast.error("Por favor, insira um nome válido para a loja.");

    setSaving(true);

    // Verificar se já existe uma loja cadastrada com o mesmo slug
    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      return toast.error("Já existe uma loja cadastrada com este nome. Por favor, escolha outro nome para sua loja.");
    }

    const { error } = await supabase.from("stores").insert({
      owner_id: userId,
      name: cleanName,
      slug: cleanSlug,
      whatsapp_number: whatsapp.trim(),
      description: description.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível criar a loja.");
    toast.success("Loja criada! Agora cadastre suas pré-vendas.");
    onCreated();
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Card className="panel border-border/60">
        <CardHeader>
          <CardTitle className="text-2xl">Abrir minha loja</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Nome da loja</Label>
              <Input
                id="store-name"
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-whats">WhatsApp da loja</Label>
              <PhoneInput
                id="store-whats"
                required
                value={whatsapp}
                onChange={setWhatsapp}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-desc">Descrição</Label>
              <Textarea
                id="store-desc"
                maxLength={280}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Criar loja
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

const emptyProduct = {
  brand: "",
  model: "",
  scale: "1:64",
  price: "",
  down_payment_amount: "",
  release_date: "",
  stock: "1",
  payment_deadline_hours: "24",
  image_url: "",
};

function ProductsTab({
  store,
  products,
  userId,
}: {
  store: Store;
  products: Product[];
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...emptyProduct });
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      store_id: store.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      release_date: form.release_date || null,
      stock: Number(form.stock || 0),
      payment_deadline_hours: Number(form.payment_deadline_hours),
      image_url: form.image_url || null,
    };

    if (form.down_payment_amount !== "") {
      payload.down_payment_amount = Number(form.down_payment_amount || 0);
    }

    let { error } = await supabase.from("products").insert(payload);

    // Se der erro por conta da coluna down_payment_amount não existir no Supabase ainda
    if (error && (error.code === "PGRST204" || error.message?.includes("down_payment_amount"))) {
      delete payload.down_payment_amount;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a miniatura.");
    setForm({ ...emptyProduct });
    queryClient.invalidateQueries();
    toast.success("Pré-venda cadastrada!");
  }

  async function toggleOpen(product: Product) {
    await supabase.from("products").update({ is_open: !product.is_open }).eq("id", product.id);
    queryClient.invalidateQueries();
  }

  async function remove(product: Product) {
    await supabase.from("products").delete().eq("id", product.id);
    queryClient.invalidateQueries();
    toast.success("Miniatura removida.");
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
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit border-border/60 panel">
        <CardHeader>
          <CardTitle className="text-lg">Nova pré-venda</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="brand">Marca</Label>
                <Input
                  id="brand"
                  required
                  maxLength={40}
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scale">Escala</Label>
                <Input
                  id="scale"
                  maxLength={12}
                  value={form.scale}
                  onChange={(e) => setForm({ ...form, scale: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Modelo</Label>
              <Input
                id="model"
                required
                maxLength={80}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="price">Total (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="240"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="down_payment">Sinal (R$)</Label>
                <Input
                  id="down_payment"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 50"
                  value={form.down_payment_amount}
                  onChange={(e) => setForm({ ...form, down_payment_amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock">Cotas</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  required
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="release">Data estimada</Label>
                <Input
                  id="release"
                  type="date"
                  value={form.release_date}
                  onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo do sinal</Label>
                <Select
                  value={form.payment_deadline_hours}
                  onValueChange={(v) => setForm({ ...form, payment_deadline_hours: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">24 horas</SelectItem>
                    <SelectItem value="48">48 horas</SelectItem>
                    <SelectItem value="72">72 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="photo">Foto da miniatura</Label>
              <Input
                id="photo"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              {form.image_url && <p className="text-xs text-success">Foto pronta para publicar.</p>}
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Publicar pré-venda
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {products.map((p) => (
          <Card key={p.id} className="border-border/60 panel">
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {p.brand} · {p.scale} · sinal em {p.payment_deadline_hours}h
                </p>
                <h3 className="font-semibold">{p.model}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">Total: {brl(Number(p.price))}</Badge>
                  {Number((p as any).down_payment_amount) > 0 && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      Sinal: {brl(Number((p as any).down_payment_amount))}
                    </Badge>
                  )}
                  <Badge variant="outline">{p.stock} cotas</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.is_open} onCheckedChange={() => toggleOpen(p)} />
                  {p.is_open ? "Aberta" : "Fechada"}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  title="Editar pré-venda"
                  onClick={() => setEditingProduct(p)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="secondary"
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
        {products.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma miniatura cadastrada ainda.</p>
        )}
      </div>

      <EditProductDialog
        product={editingProduct}
        userId={userId}
        onClose={() => setEditingProduct(null)}
      />
    </div>
  );
}

function EditProductDialog({
  product,
  userId,
  onClose,
}: {
  product: Product | null;
  userId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    brand: "",
    model: "",
    scale: "1:64",
    price: "",
    down_payment_amount: "",
    release_date: "",
    stock: "1",
    payment_deadline_hours: "24",
    is_open: true,
    image_url: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      const rawVal = (product as any).down_payment_amount;
      setForm({
        brand: product.brand ?? "",
        model: product.model ?? "",
        scale: product.scale ?? "1:64",
        price: product.price != null ? String(product.price) : "",
        down_payment_amount: rawVal != null ? String(rawVal) : "",
        release_date: product.release_date ?? "",
        stock: product.stock != null ? String(product.stock) : "1",
        payment_deadline_hours: product.payment_deadline_hours != null ? String(product.payment_deadline_hours) : "24",
        is_open: product.is_open ?? true,
        image_url: product.image_url ?? "",
      });
    }
  }, [product]);

  if (!product) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: any = {
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      release_date: form.release_date || null,
      stock: Number(form.stock || 0),
      payment_deadline_hours: Number(form.payment_deadline_hours),
      is_open: form.is_open,
      image_url: form.image_url || null,
    };

    if (form.down_payment_amount !== "") {
      payload.down_payment_amount = Number(form.down_payment_amount || 0);
    }

    let { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", product.id);

    // Se a coluna down_payment_amount não existir ainda na tabela products do Supabase
    if (error && (error.code === "PGRST204" || error.message?.includes("down_payment_amount"))) {
      delete payload.down_payment_amount;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível salvar as alterações.");
    queryClient.invalidateQueries();
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
      <DialogContent className="max-w-md panel border-border/60">
        <DialogHeader>
          <DialogTitle>Editar pré-venda</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand">Marca</Label>
              <Input
                id="edit-brand"
                required
                maxLength={40}
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-scale">Escala</Label>
              <Input
                id="edit-scale"
                maxLength={12}
                value={form.scale}
                onChange={(e) => setForm({ ...form, scale: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-model">Modelo</Label>
            <Input
              id="edit-model"
              required
              maxLength={80}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-price">Total (R$)</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-down-payment">Sinal (R$)</Label>
              <Input
                id="edit-down-payment"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 50"
                value={form.down_payment_amount}
                onChange={(e) => setForm({ ...form, down_payment_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stock">Cotas</Label>
              <Input
                id="edit-stock"
                type="number"
                min="0"
                required
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-release">Data estimada</Label>
              <Input
                id="edit-release"
                type="date"
                value={form.release_date}
                onChange={(e) => setForm({ ...form, release_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo do sinal</Label>
              <Select
                value={form.payment_deadline_hours}
                onValueChange={(v) => setForm({ ...form, payment_deadline_hours: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12 horas</SelectItem>
                  <SelectItem value="24">24 horas</SelectItem>
                  <SelectItem value="48">48 horas</SelectItem>
                  <SelectItem value="72">72 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <Label htmlFor="edit-open">Status da pré-venda</Label>
            <div className="flex items-center gap-2 text-xs">
              <Switch
                id="edit-open"
                checked={form.is_open}
                onCheckedChange={(checked) => setForm({ ...form, is_open: checked })}
              />
              {form.is_open ? "Aberta" : "Fechada"}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-photo">Foto da miniatura</Label>
            <Input
              id="edit-photo"
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Foto da miniatura"
                className="mt-2 h-16 w-full rounded-lg object-cover border border-border"
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

type OrderRow = Tables<"orders"> & {
  products: { brand: string; model: string; image_url?: string | null } | null;
  profiles: { name: string | null; email: string | null; phone: string | null } | null;
};

const PAGE_SIZE = 8;

function OrdersTab({ orders }: { orders: OrderRow[] }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Filtro por status
      if (statusFilter !== "todos" && o.payment_status !== statusFilter) {
        return false;
      }
      // Filtro por termo de busca
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const clientName = (o.profiles?.name || "").toLowerCase();
      const clientEmail = (o.profiles?.email || "").toLowerCase();
      const clientPhone = (o.profiles?.phone || "").toLowerCase();
      const prodModel = (o.products?.model || "").toLowerCase();
      const prodBrand = (o.products?.brand || "").toLowerCase();
      const orderId = (o.id || "").toLowerCase();

      return (
        clientName.includes(q) ||
        clientEmail.includes(q) ||
        clientPhone.includes(q) ||
        prodModel.includes(q) ||
        prodBrand.includes(q) ||
        orderId.includes(q)
      );
    });
  }, [orders, searchQuery, statusFilter]);

  const pages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const rows = filteredOrders.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function adjustStockOnCancel(productId: string, isCancelling: boolean) {
    if (!productId) return;
    const { data: product } = await supabase
      .from("products")
      .select("stock, is_open")
      .eq("id", productId)
      .maybeSingle();

    if (!product) return;

    if (isCancelling) {
      const newStock = (product.stock ?? 0) + 1;
      await supabase
        .from("products")
        .update({ stock: newStock, is_open: true })
        .eq("id", productId);
    } else {
      const newStock = Math.max(0, (product.stock ?? 0) - 1);
      await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", productId);
    }
  }

  async function update(
    id: string,
    patch: Partial<Pick<Tables<"orders">, "down_payment" | "payment_status" | "delivery_status">>,
  ) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);

    if (error) return toast.error("Não foi possível atualizar a reserva.");
    queryClient.invalidateQueries();
  }

  async function handlePaymentStatusChange(o: OrderRow, newStatus: string) {
    let downPayment = Number(drafts[o.id] ?? o.down_payment);
    const totalPrice = Number(o.total_price);
    const customSignal = Number((o.products as any)?.down_payment_amount || 0);

    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    const isNowCancelled = newStatus === "cancelado";

    if (!wasCancelled && isNowCancelled) {
      await adjustStockOnCancel(o.product_id, true);
    } else if (wasCancelled && !isNowCancelled) {
      await adjustStockOnCancel(o.product_id, false);
    }

    if (newStatus === "sinal_pago") {
      if (customSignal > 0) {
        downPayment = customSignal;
      } else if (downPayment === 0 && totalPrice > 0) {
        downPayment = Math.round(totalPrice * 0.2 * 100) / 100;
      }
    } else if (newStatus === "quitado") {
      downPayment = totalPrice;
    } else if (newStatus === "aguardando_sinal") {
      downPayment = 0;
    }

    setDrafts((prev) => ({ ...prev, [o.id]: String(downPayment) }));
    await update(o.id, { payment_status: newStatus, down_payment: downPayment });

    if (!wasCancelled && isNowCancelled) {
      toast.success("Reserva cancelada! +1 cota devolvida ao estoque.");
    } else {
      toast.success("Reserva atualizada.");
    }
  }

  async function handleDeliveryStatusChange(o: OrderRow, newStatus: string) {
    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    const isNowCancelled = newStatus === "cancelado";

    if (!wasCancelled && isNowCancelled) {
      await adjustStockOnCancel(o.product_id, true);
    } else if (wasCancelled && !isNowCancelled) {
      await adjustStockOnCancel(o.product_id, false);
    }

    await update(o.id, { delivery_status: newStatus });

    if (!wasCancelled && isNowCancelled) {
      toast.success("Reserva cancelada! +1 cota devolvida ao estoque.");
    } else {
      toast.success("Reserva atualizada.");
    }
  }

  return (
    <Card className="border-border/60 panel">
      {/* BARRA DE PESQUISA E FILTROS DE CLIENTE / WHATSAPP / STATUS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, WhatsApp, e-mail ou miniatura..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
              <SelectItem value="sinal_pago">Sinal pago</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Miniatura</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Sinal</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const displayName =
                  o.profiles?.name && o.profiles.name !== "Cliente"
                    ? o.profiles.name
                    : o.profiles?.email
                      ? o.profiles.email.split("@")[0]
                      : "Cliente";

                return (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap">
                      <p className="font-medium">{displayName}</p>
                      {o.profiles?.email && (
                        <p className="text-[11px] text-muted-foreground">{o.profiles.email}</p>
                      )}
                      {o.profiles?.phone ? (() => {
                        const parsed = parsePhoneWithFlag(o.profiles.phone);
                        return (
                          <a
                            href={whatsappLink(o.profiles.phone, `Olá ${displayName}, tudo bem? Estou entrando em contato sobre sua reserva!`)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 flex items-center gap-1 text-xs text-success hover:underline font-mono"
                          >
                            <MessageCircle className="size-3" />
                            {parsed?.display || o.profiles.phone}
                          </a>
                        );
                      })() : (
                        <span className="text-[11px] text-muted-foreground/60 italic block">Sem WhatsApp</span>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">#{o.id.slice(0, 8)}</p>
                    </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/50">
                        {o.products?.image_url ? (
                          <img
                            src={o.products.image_url}
                            alt={o.products.model || "Miniatura"}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <Package className="size-5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{o.products?.model || "Miniatura"}</p>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {o.products?.brand}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{brl(Number(o.total_price))}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-8 w-24"
                        type="number"
                        min="0"
                        step="0.01"
                        value={drafts[o.id] ?? String(o.down_payment)}
                        onChange={(e) => setDrafts({ ...drafts, [o.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          update(o.id, { down_payment: Number(drafts[o.id] ?? o.down_payment) })
                        }
                      >
                        OK
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-primary">
                    {brl(Number(o.remaining_balance))}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <PaymentBadge status={o.payment_status} />
                      <Select
                        value={o.payment_status}
                        onValueChange={(v) => handlePaymentStatusChange(o, v)}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                          <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                          <SelectItem value="quitado">Quitado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={o.delivery_status}
                        onValueChange={(v) => handleDeliveryStatusChange(o, v)}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="em_transito">Em trânsito</SelectItem>
                          <SelectItem value="entregue">Entregue</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.payment_status === "aguardando_sinal" && o.reservation_expires_at ? (
                      <Countdown expiresAt={o.reservation_expires_at} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma reserva ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const PRESET_COLORS = [
  { name: "Vermelho Hot Wheels", hex: "#e11d48" },
  { name: "Azul Racing", hex: "#2563eb" },
  { name: "Verde Esmeralda", hex: "#059669" },
  { name: "Amarelo Gold", hex: "#d97706" },
  { name: "Roxo Neon", hex: "#9333ea" },
  { name: "Laranja Flame", hex: "#ea580c" },
  { name: "Pink Cyber", hex: "#db2777" },
  { name: "Dark Titanium", hex: "#334155" },
];

function BrandingTab({ store, userId }: { store: Store; userId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: store.name,
    description: store.description ?? "",
    whatsapp_number: store.whatsapp_number ?? "",
    primary_color: store.primary_color || "#e11d48",
    logo_url: store.logo_url ?? "",
    favicon_url: store.logo_url ?? store.favicon_url ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = form.name.trim();
    const cleanSlug = slugify(cleanName);
    if (!cleanSlug) return toast.error("Por favor, insira um nome válido para a loja.");

    setSaving(true);

    // Verificar se já existe OUTRA loja cadastrada com o mesmo slug
    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", cleanSlug)
      .neq("id", store.id)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      return toast.error("Já existe uma loja cadastrada com este nome. Por favor, escolha outro nome para sua loja.");
    }

    const logo = form.logo_url.trim() || null;
    const { error } = await supabase
      .from("stores")
      .update({
        name: cleanName,
        slug: cleanSlug,
        description: form.description.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        primary_color: form.primary_color,
        logo_url: logo,
        favicon_url: logo,
      })
      .eq("id", store.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar.");
    updateAppFavicon(logo);
    queryClient.invalidateQueries();
    toast.success("Identidade da loja atualizada!");
  }

  async function onLogoFile(file: File) {
    try {
      const url = await uploadImage(userId, file);
      // Atualiza tanto o logo quanto o favicon automaticamente com a mesma imagem
      setForm((f) => ({ ...f, logo_url: url, favicon_url: url }));
      updateAppFavicon(url);
      toast.success("Logotipo enviado! (definido como favicon)");
    } catch {
      toast.error("Falha ao enviar o logotipo.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="border-border/60 panel">
        <CardHeader>
          <CardTitle className="text-lg">Personalização e Identidade da loja</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Nome da loja</Label>
              <Input
                id="b-name"
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-desc">Descrição / Apresentação</Label>
              <Textarea
                id="b-desc"
                maxLength={280}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="b-whats">WhatsApp de Atendimento</Label>
              <PhoneInput
                id="b-whats"
                value={form.whatsapp_number}
                onChange={(val) => setForm({ ...form, whatsapp_number: val })}
              />
            </div>

            {/* SEÇÃO DE CORES DA LOJA */}
            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4">
              <Label className="text-base font-semibold">Cor de Tema da Loja</Label>
              <p className="text-xs text-muted-foreground">
                Escolha uma das cores rápidas ou defina o código Hex da cor principal da sua marca.
              </p>

              {/* Botões de Cores Rápidas */}
              <div className="flex flex-wrap gap-2 pt-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    title={color.name}
                    className={`group relative flex size-9 items-center justify-center rounded-full transition-all hover:scale-110 ${
                      form.primary_color.toLowerCase() === color.hex.toLowerCase()
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                        : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => setForm({ ...form, primary_color: color.hex })}
                  >
                    {form.primary_color.toLowerCase() === color.hex.toLowerCase() && (
                      <span className="size-2 rounded-full bg-white shadow-sm" />
                    )}
                  </button>
                ))}
              </div>

              {/* Seletor de cor customizada */}
              <div className="flex items-center gap-3 pt-2">
                <Input
                  id="b-color"
                  type="color"
                  className="h-10 w-14 cursor-pointer p-1"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                />
                <Input
                  type="text"
                  placeholder="#e11d48"
                  className="font-mono text-sm uppercase"
                  maxLength={7}
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                />
              </div>
            </div>

            {/* SEÇÃO DE LOGOTIPO E FAVICON */}
            <div className="space-y-2">
              <Label htmlFor="b-logo">Logotipo da Loja (também usado como Favicon)</Label>
              <p className="text-xs text-muted-foreground">
                A imagem enviada aqui será usada como a foto/logo da sua loja e como ícone (favicon) na aba do navegador.
              </p>
              <Input
                id="b-logo"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onLogoFile(e.target.files[0])}
              />
              {form.logo_url && (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={form.logo_url}
                    alt="Prévia do logotipo"
                    className="size-14 rounded-xl object-cover border border-border shadow-sm"
                  />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Logotipo ativo</p>
                    <p>Aplicado automaticamente à loja e como ícone do navegador (favicon).</p>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* CARD DE LIVE PREVIEW DA LOJA */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Prévia em tempo real</h3>
        <Card
          className="border-border/60 panel overflow-hidden"
          style={{ borderTopColor: form.primary_color, borderTopWidth: 4 }}
        >
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="size-12 rounded-xl object-cover"
                />
              ) : (
                <div
                  className="flex size-12 items-center justify-center rounded-xl font-bold text-white text-lg"
                  style={{ backgroundColor: form.primary_color }}
                >
                  {form.name ? form.name[0].toUpperCase() : "L"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-base truncate">{form.name || "Sua Loja"}</h4>
                <p className="text-xs text-muted-foreground truncate">
                  {form.description || "Descrição da sua loja de miniaturas"}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Amostra de Botão e Cores
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className="font-bold text-lg"
                  style={{ color: form.primary_color }}
                >
                  R$ 149,90
                </span>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-opacity"
                  style={{ backgroundColor: form.primary_color }}
                >
                  Seguir loja
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
