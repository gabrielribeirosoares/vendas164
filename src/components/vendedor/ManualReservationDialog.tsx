
import { getInstallmentOptions, getProductSignalAmount, hasNoSignalRequirement, isProntaEntrega } from "@/lib/format";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/PhoneInput";
import { getCustomerFromCache, saveCustomerToCache } from "@/lib/customerCache";


import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

import { useSession } from "@/lib/session";



import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

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
  const manualAttempt = useRef<{ fingerprint: string; id: string; expiresAt: string | null } | null>(null);
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
        .select("pix_key, whatsapp_number, default_installment_due_day")
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
        if (isProntaEntrega(p)) {
          setPaymentStatus("pronta_entrega");
        } else if (hasNoSignalRequirement(p)) {
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
      } else if (paymentStatus === "pronta_entrega" || paymentStatus === "sem_sinal") {
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

      const orderPayload = {
        user_id: effectiveUserId, total_price: totalPrice, down_payment: downPayment,
        payment_status: paymentStatus, reservation_expires_at: expiresAt,
        installment_count: installmentCount, pix_key: guestKeyString,
        signal_amount: Math.min(totalPrice, getProductSignalAmount(product, 1).amount),
      };
      const fingerprint = JSON.stringify({ product: product.id, quantity: qtyToCreate, order: { ...orderPayload, reservation_expires_at: null } });
      if (manualAttempt.current?.fingerprint !== fingerprint) manualAttempt.current = { fingerprint, id: crypto.randomUUID(), expiresAt };
      orderPayload.reservation_expires_at = manualAttempt.current.expiresAt;
      const { data: createdIds, error: reservationError } = await supabase.rpc("create_manual_reservations", {
        _request_id: manualAttempt.current.id, _product_id: product.id, _quantity: qtyToCreate, _order: orderPayload,
      });
      if (reservationError) throw reservationError;
      for (const id of createdIds ?? []) saveCustomerToCache({ id, name: cleanName, phone: cleanPhone });
      manualAttempt.current = null;

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
                <SelectItem value="pronta_entrega" className="text-xs sm:text-sm">Pronta Entrega</SelectItem>
                <SelectItem value="sinal_pago" className="text-xs sm:text-sm">Sinal Pago</SelectItem>
                <SelectItem value="quitado" className="text-xs sm:text-sm">Pago Total (Quitado)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Parcelamento */}
          {(() => {
            const selectedProduct = products.find((p) => p.id === selectedProductId);
            const instOptions = selectedProduct ? getInstallmentOptions(selectedProduct, manualQuantity) : [];
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
