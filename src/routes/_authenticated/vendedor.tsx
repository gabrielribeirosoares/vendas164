import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
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
import { brl, slugify } from "@/lib/format";
import { useSession } from "@/lib/session";
import { uploadImage } from "@/lib/upload";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/vendedor")({
  head: () => ({
    meta: [
      { title: "Painel do lojista — MiniPré" },
      {
        name: "description",
        content:
          "Gerencie pré-vendas, cotas, sinais recebidos, saldo a receber e a identidade da sua loja.",
      },
      { property: "og:title", content: "Painel do lojista — MiniPré" },
      { property: "og:description", content: "Gestão completa de pré-vendas de miniaturas." },
    ],
  }),
  component: SellerDashboard,
});

type Store = Tables<"stores">;
type Product = Tables<"products">;

function SellerDashboard() {
  const { user } = useSession();
  const queryClient = useQueryClient();

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
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(brand, model)")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
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

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <CreateStore onCreated={() => queryClient.invalidateQueries()} userId={user!.id} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{store.name}</h1>
            <p className="text-sm text-muted-foreground">/loja/{store.slug}</p>
          </div>
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

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Valor total projetado" value={brl(totals.projected)} />
          <Stat label="Sinal recebido" value={brl(totals.received)} accent="text-success" />
          <Stat label="Saldo a receber" value={brl(totals.pending)} accent="text-warning" />
        </div>

        <Tabs defaultValue="produtos" className="mt-8">
          <TabsList>
            <TabsTrigger value="produtos">Estoque e pré-vendas</TabsTrigger>
            <TabsTrigger value="reservas">Reservas</TabsTrigger>
            <TabsTrigger value="loja">Personalização</TabsTrigger>
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
    setSaving(true);
    const { error } = await supabase.from("stores").insert({
      owner_id: userId,
      name: name.trim(),
      slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`,
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
              <Label htmlFor="store-whats">WhatsApp (com DDI e DDD)</Label>
              <Input
                id="store-whats"
                placeholder="5511999999999"
                maxLength={20}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      store_id: store.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      release_date: form.release_date || null,
      stock: Number(form.stock || 0),
      payment_deadline_hours: Number(form.payment_deadline_hours),
      image_url: form.image_url || null,
    });
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="price">Preço total (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
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
                  <Badge variant="secondary">{brl(Number(p.price))}</Badge>
                  <Badge variant="outline">{p.stock} cotas</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={p.is_open} onCheckedChange={() => toggleOpen(p)} />
                  {p.is_open ? "Aberta" : "Fechada"}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
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
    </div>
  );
}

type OrderRow = Tables<"orders"> & {
  products: { brand: string; model: string } | null;
  profiles: { name: string | null; email: string | null } | null;
};

const PAGE_SIZE = 8;

function OrdersTab({ orders }: { orders: OrderRow[] }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const pages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const rows = orders.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function update(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) return toast.error("Não foi possível atualizar a reserva.");
    queryClient.invalidateQueries();
    toast.success("Reserva atualizada.");
  }

  return (
    <Card className="border-border/60 panel">
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
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap">
                    <p className="font-medium">{o.profiles?.name || "Cliente"}</p>
                    <p className="text-xs text-muted-foreground">#{o.id.slice(0, 8)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {o.products?.brand} {o.products?.model}
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
                        onValueChange={(v) => update(o.id, { payment_status: v })}
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
                        onValueChange={(v) => update(o.id, { delivery_status: v })}
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
              ))}
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

function BrandingTab({ store, userId }: { store: Store; userId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: store.name,
    description: store.description ?? "",
    whatsapp_number: store.whatsapp_number ?? "",
    primary_color: store.primary_color,
    logo_url: store.logo_url ?? "",
    favicon_url: store.favicon_url ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("stores")
      .update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        primary_color: form.primary_color,
        logo_url: form.logo_url || null,
        favicon_url: form.favicon_url || null,
      })
      .eq("id", store.id);
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar.");
    queryClient.invalidateQueries();
    toast.success("Identidade da loja atualizada!");
  }

  async function onFile(file: File, field: "logo_url" | "favicon_url") {
    try {
      const url = await uploadImage(userId, file);
      setForm((f) => ({ ...f, [field]: url }));
      toast.success("Imagem enviada!");
    } catch {
      toast.error("Falha ao enviar a imagem.");
    }
  }

  return (
    <Card className="max-w-2xl border-border/60 panel">
      <CardHeader>
        <CardTitle className="text-lg">Identidade da loja</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="b-name">Nome</Label>
            <Input
              id="b-name"
              maxLength={60}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-desc">Descrição</Label>
            <Textarea
              id="b-desc"
              maxLength={280}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-whats">WhatsApp</Label>
              <Input
                id="b-whats"
                placeholder="5511999999999"
                maxLength={20}
                value={form.whatsapp_number}
                onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-color">Cor principal</Label>
              <Input
                id="b-color"
                type="color"
                className="h-10 p-1"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-logo">Logo</Label>
              <Input
                id="b-logo"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0], "logo_url")}
              />
              {form.logo_url && (
                <img
                  src={form.logo_url}
                  alt="Prévia do logo"
                  className="mt-2 size-12 rounded-lg object-cover"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-fav">Favicon</Label>
              <Input
                id="b-fav"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0], "favicon_url")}
              />
              {form.favicon_url && (
                <img
                  src={form.favicon_url}
                  alt="Prévia do favicon"
                  className="mt-2 size-8 rounded object-cover"
                />
              )}
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
