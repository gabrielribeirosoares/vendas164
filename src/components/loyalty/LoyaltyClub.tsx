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

export function LoyaltyClub({ storeId, seller = false }: { storeId: string; seller?: boolean }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [ruleDraft, setRuleDraft] = useState<{
    coins: string;
    spend: string;
    ruleId: string | null;
  } | null>(null);
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
    onSuccess: async (_result, variables) => {
      if (
        variables.action === "configure" &&
        variables.payload &&
        typeof variables.payload === "object" &&
        !Array.isArray(variables.payload) &&
        "spend_cents" in variables.payload
      )
        setRuleDraft(null);
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
  const canConfigureRules = data.data.configurable_rules === true;
  const balance = Number(account?.balance || 0);
  const remainder = Number(account?.remainder_cents || 0);
  const deficit = Number(account?.deficit || 0);
  const ruleSpend = Number(program?.spend_cents || 5000);
  const ruleCoins = Number(program?.coins_per_step || 1);
  const nextSpend = Number(account?.next_spend_cents || ruleSpend);
  const nextCoins = Number(account?.next_coins || ruleCoins);
  const coinLabel = (count: number) => `${count} ${count === 1 ? "Coin" : "Coins"}`;
  const limitReached = (reward: LoyaltyReward) =>
    reward.per_customer_limit != null &&
    Number(reward.redeemed_count ?? 0) >= reward.per_customer_limit;
  const rewardPriority = (reward: LoyaltyReward) =>
    !reward.active || reward.stock <= 0 || limitReached(reward)
      ? 2
      : balance >= reward.coins
        ? 0
        : 1;
  const displayedRewards = seller
    ? rewards
    : [...rewards].sort((a, b) => rewardPriority(a) - rewardPriority(b) || a.coins - b.coins);
  function editRule(field: "coins" | "spend", value: string) {
    setRuleDraft((current) => ({
      coins: String(ruleCoins),
      spend: (ruleSpend / 100).toFixed(2),
      ruleId: program?.rule_id ?? null,
      ...current,
      [field]: value,
    }));
  }
  const pageItemCount =
    activeTab === "clients"
      ? accounts.length
      : activeTab === "redemptions"
        ? redemptions.length
        : activeTab === "history"
          ? ledger.length
          : 0;
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
          {!seller && (
            <p className="mt-1 text-sm text-muted-foreground">
              {coinLabel(ruleCoins)} a cada {brl(ruleSpend / 100)} pagos.
            </p>
          )}
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
            {canConfigureRules && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  mutation.mutate({
                    action: "configure",
                    payload: {
                      spend_cents: Math.round(Number(ruleDraft?.spend ?? ruleSpend / 100) * 100),
                      coins_per_step: Number(ruleDraft?.coins ?? ruleCoins),
                      expected_rule_id: ruleDraft ? ruleDraft.ruleId : (program?.rule_id ?? null),
                    },
                  });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="earning-coins">Coins ganhos</Label>
                    <Input
                      id="earning-coins"
                      type="number"
                      min={1}
                      max={1000000}
                      step={1}
                      required
                      disabled={busy}
                      value={ruleDraft?.coins ?? ruleCoins}
                      onChange={(event) => editRule("coins", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="earning-spend">A cada valor pago (R$)</Label>
                    <Input
                      id="earning-spend"
                      type="number"
                      min={0.01}
                      max={1000000}
                      step="0.01"
                      required
                      disabled={busy}
                      value={ruleDraft?.spend ?? (ruleSpend / 100).toFixed(2)}
                      onChange={(event) => editRule("spend", event.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Alterações preservam os Coins e o progresso já acumulado.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy || !ruleDraft}>
                    Salvar pontuação
                  </Button>
                  {ruleDraft && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setRuleDraft(null)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            )}
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
            {program?.enabled && (
              <p className="text-sm">
                Faltam {brl((nextSpend - remainder) / 100)} em pagamentos para ganhar{" "}
                {coinLabel(nextCoins)}
                {account?.previous_rule ? " pela regra anterior" : ""}.
              </p>
            )}
            {deficit > 0 && (
              <p className="text-sm text-muted-foreground">
                {deficit} Coins a compensar por estornos.
              </p>
            )}
            {!program?.enabled && (
              <p className="text-sm">
                {program
                  ? "Programa pausado. Seus pontos e histórico continuam disponíveis."
                  : "Esta loja ainda não ativou o Clube de Coins."}
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
          <TabsTrigger value="redemptions">
            {seller ? "Resgates" : "Meus resgates"}
            {seller && Number(data.data.pending_redemptions) > 0 && (
              <span
                className="ml-2 rounded-full bg-primary/10 px-2 text-xs text-primary"
                aria-label={`${data.data.pending_redemptions} aguardando aprovação`}
              >
                {data.data.pending_redemptions}
              </span>
            )}
          </TabsTrigger>
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
              <p className="py-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            )}
            {accounts.map((a) => (
              <Card key={a.user_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{a.customer_name || "Cliente"}</p>
                    <p className="text-sm text-muted-foreground">
                      {coinLabel(Number(a.balance))}{" "}
                      {Number(a.balance) === 1 ? "disponível" : "disponíveis"}
                      {Number(a.remainder_cents) > 0
                        ? ` · ${brl(Number(a.remainder_cents) / 100)} acumulados para o próximo ganho`
                        : ""}
                      {Number(a.deficit) > 0 ? ` · ${a.deficit} Coins a compensar` : ""}
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
                    Ver histórico
                  </Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        )}
        <TabsContent value="rewards" className="space-y-3">
          {!rewards.length && (
            <p className="py-6 text-sm text-muted-foreground">
              Nenhuma recompensa cadastrada no momento.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedRewards.map((r) => (
              <Card
                key={r.id}
                className={`overflow-hidden ${!seller && program?.enabled && rewardPriority(r) === 0 ? "border-primary/40" : ""}`}
              >
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
                  {r.description && (
                    <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{coinLabel(r.coins)}</p>
                    {!seller && program?.enabled && rewardPriority(r) === 0 && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        Saldo suficiente
                      </span>
                    )}
                  </div>
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
                        limitReached(r) ||
                        balance < r.coins
                      }
                      onClick={() => {
                        setRedeeming(r);
                        setRequestId(crypto.randomUUID());
                      }}
                    >
                      {limitReached(r)
                        ? "Limite atingido"
                        : !program?.enabled
                          ? "Programa pausado"
                          : !r.active || r.stock <= 0
                            ? "Indisponível"
                            : balance < r.coins
                              ? `Faltam ${coinLabel(r.coins - balance)}`
                              : "Resgatar"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="redemptions" className="space-y-3">
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
            {coinLabel(ruleCoins)} a cada {brl(ruleSpend / 100)} pagos. Sinais e parcelas
            confirmados contam a partir da ativação. O restante fica acumulado.
          </p>
          <p>
            Mudanças de pontuação preservam os Coins ganhos. O progresso já iniciado completa um
            ciclo pela regra anterior. Cancelamentos e estornos ajustam os pontos correspondentes.
          </p>
          <p>Os Coins valem apenas nesta loja e não podem ser convertidos em dinheiro.</p>
          <p>
            Resgates dependem de estoque e aprovação da loja. O frete fica por conta do cliente. Se
            o resgate for recusado, os Coins são devolvidos.
          </p>
        </TabsContent>
      </Tabs>
      {(page > 0 || pageItemCount === 100) &&
        ["clients", "redemptions", "history"].includes(activeTab) && (
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
              disabled={data.isFetching || pageItemCount < 100}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima página
            </Button>
          </div>
        )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!busy && !photoUploading && !open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar recompensa" : "Nova recompensa"}</DialogTitle>
            <DialogDescription className="sr-only">Cadastro de recompensa.</DialogDescription>
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
            <DialogDescription>Cliente: {account?.customer_name || "Cliente"}.</DialogDescription>
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
