import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Coins, Gift, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { brl } from "@/lib/format";
import { uploadImage } from "@/lib/upload";
import { getImageUploadErrorMessage } from "@/lib/imageOptimization";
import { useSession } from "@/lib/session";
import {
  getLoyaltyData,
  getLoyaltyPrograms,
  loyaltyCommand,
  loyaltyError,
  redemptionLabels,
  type LoyaltyReward,
  type RedemptionStatus,
} from "@/lib/loyalty";

const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const emptyReward = {
  name: "",
  description: "",
  image_url: "",
  coins: 1,
  stock: 1,
  active: true,
  per_customer_limit: "",
};

export function CustomerLoyaltyClub() {
  const { user } = useSession();
  const [selected, setSelected] = useState("");
  const programs = useQuery({
    queryKey: ["loyalty", user?.id, "programs"],
    queryFn: getLoyaltyPrograms,
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const storeId = programs.data?.some((p) => p.store_id === selected)
    ? selected
    : programs.data?.[0]?.store_id;
  if (programs.isPending) return <p role="status">Carregando programas de fidelidade...</p>;
  if (programs.isError)
    return (
      <div role="alert">
        Não foi possível carregar os programas.{" "}
        <Button variant="outline" onClick={() => void programs.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!programs.data?.length)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          As lojas onde você é cliente ainda não ativaram o Clube de Coins.
          <Button className="mt-3 block" variant="outline" onClick={() => void programs.refetch()}>
            Verificar novamente
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-2">
        <Label htmlFor="coins-store">Loja</Label>
        <select
          id="coins-store"
          value={storeId}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-md border bg-background p-2 text-sm"
        >
          {programs.data.map((p) => (
            <option key={p.store_id} value={p.store_id}>
              {p.name}
              {!p.enabled ? " — programa pausado" : ""}
            </option>
          ))}
        </select>
      </div>
      {storeId && <LoyaltyClub key={storeId} storeId={storeId} />}
    </div>
  );
}

export function LoyaltyClub({ storeId, seller = false }: { storeId: string; seller?: boolean }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState("");
  const [activeTab, setActiveTab] = useState(seller ? "clients" : "rewards");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<
    (typeof emptyReward & { id?: string; expected_stock?: number }) | null
  >(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [redeeming, setRedeeming] = useState<LoyaltyReward | null>(null);
  const [requestId, setRequestId] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");
  const [adjustmentId, setAdjustmentId] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const data = useQuery({
    queryKey: [
      "loyalty",
      user?.id,
      storeId,
      seller ? "seller" : "customer",
      customer,
      page,
      search,
    ],
    queryFn: () =>
      getLoyaltyData(storeId, seller ? customer || undefined : user!.id, page * 100, search),
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: ({
      action,
      payload,
    }: {
      action: Parameters<typeof loyaltyCommand>[1];
      payload: Parameters<typeof loyaltyCommand>[2];
    }) => loyaltyCommand(storeId, action, payload),
    onSuccess: async () => {
      setEditing(null);
      setRedeeming(null);
      setAdjustOpen(false);
      setAdjustment("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      toast.success("Clube de Coins atualizado.");
    },
    onError: (error) => {
      toast.error(loyaltyError(error));
      void queryClient.invalidateQueries({ queryKey: ["loyalty"] });
    },
  });
  const busy = mutation.isPending;
  if (data.isPending)
    return (
      <p role="status" className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Carregando Coins...
      </p>
    );
  if (data.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>Não foi possível atualizar os Coins.</p>
        <Button variant="outline" onClick={() => void data.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  const { program, accounts, rewards, redemptions, ledger } = data.data;
  const account = accounts[0];
  const balance = Number(account?.balance || 0);
  const remainder = Number(account?.remainder_cents || 0);
  const deficit = Number(account?.deficit || 0);
  const nameFor = (id: string) =>
    accounts.find((a) => a.user_id === id)?.customer_name ||
    redemptions.find((r) => r.user_id === id)?.customer_name ||
    "Cliente";
  return (
    <div className="space-y-5 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Coins className="size-5 text-primary" /> Clube de Coins
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada R$ 50 em compras pagas gera 1 Coin. Os pontos pertencem a esta loja.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={data.isFetching}
          onClick={() => void data.refetch()}
        >
          <RefreshCw className="mr-2 size-4" />
          Atualizar
        </Button>
      </div>
      {seller && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm">
              {program?.enabled ? "Programa ativo" : "Programa desativado ou pausado"}
            </p>
            <p className="text-xs text-muted-foreground">
              A regra é fixa: 1 Coin a cada R$ 50 pagos, somando sinais e parcelas. Na primeira
              ativação, valores já recebidos ficam fora do cálculo. Novos pagamentos passam a
              pontuar. Ao pausar, novos pagamentos deixam de pontuar; o saldo e os estornos são
              preservados.
            </p>
            <Button
              disabled={busy}
              variant={program?.enabled ? "outline" : "default"}
              onClick={() =>
                mutation.mutate({ action: "configure", payload: { enabled: !program?.enabled } })
              }
            >
              {program?.enabled ? "Pausar programa" : "Ativar programa"}
            </Button>
          </CardContent>
        </Card>
      )}
      {!seller && (
        <Card className="border-primary/20">
          <CardContent className="p-5 space-y-2">
            <p className="text-sm text-muted-foreground">Seu saldo nesta loja</p>
            <p className="text-3xl font-semibold tabular-nums">
              {balance} <span className="text-base">Coins</span>
            </p>
            <p className="text-sm">
              {brl(remainder / 100)} acumulados para o próximo Coin. Faltam{" "}
              {brl((5000 - remainder) / 100)} em pagamentos elegíveis.
            </p>
            {deficit > 0 && (
              <p className="text-sm text-muted-foreground">
                Há {deficit} Coins a compensar após estornos. Novos créditos compensam esse ajuste
                antes de liberar outros resgates.
              </p>
            )}
            {!program?.enabled && (
              <p className="text-sm">
                Programa pausado. Seus pontos e histórico continuam disponíveis.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {seller && program && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditing({ ...emptyReward })}>Cadastrar recompensa</Button>
          {customer && (
            <Button
              variant="outline"
              onClick={() => {
                setAdjustOpen(true);
                setAdjustmentId(crypto.randomUUID());
              }}
            >
              Ajustar Coins do cliente
            </Button>
          )}
        </div>
      )}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          setPage(0);
        }}
      >
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/30">
          {seller && <TabsTrigger value="clients">Clientes</TabsTrigger>}
          <TabsTrigger value="rewards">Recompensas</TabsTrigger>
          <TabsTrigger value="redemptions">Resgates</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="rules">Como funciona</TabsTrigger>
        </TabsList>
        {seller && (
          <TabsContent value="clients" className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput.trim());
                setCustomer("");
                setPage(0);
              }}
            >
              <Input
                aria-label="Buscar cliente pelo nome"
                placeholder="Buscar cliente pelo nome"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Button type="submit" variant="outline">
                Buscar
              </Button>
            </form>
            {customer && (
              <Button
                variant="outline"
                onClick={() => {
                  setCustomer("");
                  setSearch("");
                  setSearchInput("");
                  setPage(0);
                }}
              >
                Voltar para todos os clientes
              </Button>
            )}
            {!accounts.length && (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhum cliente encontrado. Clientes da loja aparecem após a ativação.
              </p>
            )}
            {accounts.map((a) => (
              <Card key={a.user_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{a.customer_name || "Cliente"}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.balance} Coins disponíveis · {brl(Number(a.remainder_cents) / 100)}{" "}
                      acumulados{Number(a.deficit) > 0 ? ` · ${a.deficit} Coins a compensar` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCustomer(a.user_id);
                      setActiveTab("history");
                      setSearch("");
                      setPage(0);
                    }}
                  >
                    Ver histórico e resgates
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}
        <TabsContent value="rewards" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            O frete da recompensa é por conta do cliente. Resgates dependem de disponibilidade e
            aprovação da loja.
          </p>
          {!rewards.length && (
            <p className="py-6 text-sm text-muted-foreground">
              Nenhuma recompensa cadastrada no momento.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.map((r) => (
              <Card key={r.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  {r.image_url ? (
                    <img
                      src={r.image_url}
                      alt={r.name}
                      loading="lazy"
                      className="aspect-video w-full rounded-lg object-contain bg-muted/30"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg bg-muted/30">
                      <Gift className="size-10 text-muted-foreground" />
                    </div>
                  )}
                  <h3 className="font-semibold break-words">{r.name}</h3>
                  <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                    {r.description}
                  </p>
                  <p className="font-semibold">{r.coins} Coins</p>
                  <p className="text-xs text-muted-foreground">
                    {r.stock > 0 ? `${r.stock} disponíveis` : "Sem estoque"}
                    {!r.active ? " · Desativada" : ""}
                    {r.per_customer_limit ? ` · Limite de ${r.per_customer_limit} por cliente` : ""}
                  </p>
                  {seller ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditing({
                          ...r,
                          expected_stock: r.stock,
                          per_customer_limit: r.per_customer_limit?.toString() || "",
                        })
                      }
                    >
                      Editar recompensa
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={
                        busy ||
                        data.isFetching ||
                        !program?.enabled ||
                        !r.active ||
                        r.stock <= 0 ||
                        balance < r.coins
                      }
                      onClick={() => {
                        setRedeeming(r);
                        setRequestId(crypto.randomUUID());
                      }}
                    >
                      {r.stock <= 0
                        ? "Indisponível"
                        : balance < r.coins
                          ? `Faltam ${r.coins - balance} Coins`
                          : "Resgatar"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="redemptions" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Até 100 resgates por página{customer ? " do cliente selecionado" : ""}.
          </p>
          {!redemptions.length && (
            <p className="py-4 text-sm text-muted-foreground">Nenhum resgate nesta página.</p>
          )}
          {redemptions.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2 p-4">
                <p className="font-medium">
                  {d.reward_name} · {d.coins} Coins
                </p>
                {seller && <p className="text-sm">{d.customer_name || nameFor(d.user_id)}</p>}
                <p className="text-xs text-muted-foreground">
                  {date(d.created_at)} · {redemptionLabels[d.status]}
                </p>
                {seller && (
                  <div className="flex flex-wrap gap-2">
                    {(d.status === "pending"
                      ? ["approved", "rejected"]
                      : d.status === "approved"
                        ? ["shipped", "rejected"]
                        : d.status === "shipped"
                          ? ["delivered"]
                          : []
                    ).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          mutation.mutate({
                            action: "redemption_status",
                            payload: { id: d.id, status },
                          })
                        }
                      >
                        {
                          (
                            {
                              approved: "Aprovar",
                              rejected: "Recusar e devolver Coins",
                              shipped: "Marcar como enviado",
                              delivered: "Marcar como entregue",
                            } as Partial<Record<RedemptionStatus, string>>
                          )[status as RedemptionStatus]
                        }
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="history" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Até 100 movimentações por página{customer ? " do cliente selecionado" : ""}.
          </p>
          {!ledger.length && (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma movimentação nesta página.</p>
          )}
          {ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start justify-between gap-3 border-b py-3 text-sm"
            >
              <div>
                <p className="break-words">{entry.reason}</p>
                {seller && (
                  <p className="text-xs text-muted-foreground">{nameFor(entry.user_id)}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {date(entry.created_at)}
                  {Number(entry.eligible_cents) !== 0
                    ? ` · ${brl(Number(entry.eligible_cents) / 100)} em compras elegíveis`
                    : ""}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {Number(entry.coins) > 0 ? "+" : ""}
                {entry.coins} Coins
              </span>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="rules" className="space-y-3 text-sm leading-relaxed">
          <p>
            A cada R$ 50 em compras elegíveis efetivamente pagas, você ganha 1 Coin. Valores menores
            ficam acumulados para o próximo Coin. Sinais e parcelas contam após confirmação, até o
            valor total da compra.
          </p>
          <p>
            Contam os valores recebidos enquanto o programa estiver ativo, a partir da primeira
            ativação pela loja. Pagamentos anteriores não geram Coins automaticamente. Cancelamentos
            e estornos ajustam os pontos correspondentes.
          </p>
          <p>
            Os Coins valem apenas nesta loja, não são dinheiro, não podem ser sacados e não têm
            conversão em dinheiro.
          </p>
          <p>
            O lojista define as recompensas, quantos Coins cada uma exige, o estoque e os limites
            por cliente. Ao confirmar um resgate, os Coins são debitados e uma unidade fica
            reservada. Se a loja recusar, os Coins são devolvidos.
          </p>
          <p>O frete fica por conta do cliente. Acompanhe a aprovação e o envio na aba Resgates.</p>
        </TabsContent>
      </Tabs>
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={page === 0 || data.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Página anterior
        </Button>
        <span className="text-xs">Página {page + 1}</span>
        <Button
          variant="outline"
          disabled={
            data.isFetching ||
            (accounts.length < 100 && ledger.length < 100 && redemptions.length < 100)
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima página
        </Button>
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!busy && !photoUploading && !open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar recompensa" : "Nova recompensa"}</DialogTitle>
            <DialogDescription>
              Defina os Coins necessários e o estoque disponível para resgate.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (photoUploading) return;
                mutation.mutate({
                  action: "reward",
                  payload: {
                    ...editing,
                    per_customer_limit: editing.per_customer_limit
                      ? Number(editing.per_customer_limit)
                      : null,
                  },
                });
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="reward-name">Nome</Label>
                <Input
                  id="reward-name"
                  required
                  maxLength={120}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reward-description">Descrição</Label>
                <Textarea
                  id="reward-description"
                  maxLength={2000}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reward-image">Foto da recompensa (opcional)</Label>
                {editing.image_url && (
                  <div className="space-y-2">
                    <img
                      src={editing.image_url}
                      alt="Foto da recompensa"
                      className="h-40 w-full rounded-lg border bg-muted/30 object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || photoUploading}
                      onClick={() =>
                        setEditing((current) => (current ? { ...current, image_url: "" } : current))
                      }
                    >
                      Remover foto
                    </Button>
                  </div>
                )}
                <Input
                  id="reward-image"
                  type="file"
                  accept="image/*"
                  disabled={busy || photoUploading}
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    if (!file || !user || photoUploading) return;
                    setPhotoUploading(true);
                    try {
                      const imageUrl = await uploadImage(user.id, file, "product");
                      setEditing((current) =>
                        current ? { ...current, image_url: imageUrl } : current,
                      );
                      toast.success("Foto enviada com sucesso.");
                    } catch (error) {
                      toast.error(getImageUploadErrorMessage(error));
                    } finally {
                      setPhotoUploading(false);
                      input.value = "";
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground" role="status">
                  {photoUploading
                    ? "Enviando foto... Aguarde para salvar a recompensa."
                    : "Escolha uma foto do celular ou computador. Máximo de 12 MB."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="reward-coins">Coins necessários</Label>
                  <Input
                    id="reward-coins"
                    type="number"
                    min={1}
                    max={1000000}
                    step={1}
                    required
                    value={editing.coins}
                    onChange={(e) => setEditing({ ...editing, coins: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reward-stock">Estoque disponível</Label>
                  <Input
                    id="reward-stock"
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    required
                    value={editing.stock}
                    onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reward-limit">Limite por cliente (opcional)</Label>
                <Input
                  id="reward-limit"
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  value={editing.per_customer_limit}
                  onChange={(e) => setEditing({ ...editing, per_customer_limit: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Recompensa ativa
              </label>
              <Button type="submit" disabled={busy || photoUploading}>
                Salvar recompensa
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!redeeming}
        onOpenChange={(open) => {
          if (!busy && !open) setRedeeming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar resgate</DialogTitle>
            <DialogDescription>
              {redeeming?.name} por {redeeming?.coins} Coins. O frete é por sua conta. A loja
              analisará a solicitação.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Os Coins serão descontados ao confirmar. Se o resgate for recusado, eles voltam para seu
            saldo.
          </p>
          <Button
            disabled={busy || data.isFetching}
            onClick={() =>
              redeeming &&
              mutation.mutate({
                action: "redeem",
                payload: {
                  reward_id: redeeming.id,
                  expected_coins: redeeming.coins,
                  request_id: requestId,
                },
              })
            }
          >
            {busy ? "Confirmando..." : "Confirmar resgate"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={adjustOpen}
        onOpenChange={(open) => {
          if (!busy) setAdjustOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Coins</DialogTitle>
            <DialogDescription>
              Cliente: {account?.customer_name || "Cliente"}. Toda alteração fica no histórico.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({
                action: "adjust",
                payload: {
                  user_id: customer,
                  coins: Number(adjustment),
                  reason: reason.trim(),
                  request_id: adjustmentId,
                },
              });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="coins-adjustment">Quantidade (negativa para retirar)</Label>
              <Input
                id="coins-adjustment"
                type="number"
                min={-1000000}
                max={1000000}
                step={1}
                required
                value={adjustment}
                onChange={(e) => {
                  setAdjustment(e.target.value);
                  setAdjustmentId(crypto.randomUUID());
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="coins-reason">Motivo</Label>
              <Textarea
                id="coins-reason"
                minLength={3}
                maxLength={500}
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setAdjustmentId(crypto.randomUUID());
                }}
              />
            </div>
            <Button disabled={busy || !Number(adjustment)} type="submit">
              Confirmar ajuste
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
