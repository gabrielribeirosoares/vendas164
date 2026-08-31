import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { slugify } from '@/lib/format';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PhoneInput } from '@/components/PhoneInput';
import { DEFAULT_PRESET_BRANDS, getStoreBrands, saveStoreBrands } from '@/lib/brands';
import { getStoreBanner, saveStoreBanner } from '@/lib/storeCustomizations';
import { uploadImage } from '@/lib/upload';
import { updateAppFavicon } from '@/lib/favicon';
import type { Tables } from '@/integrations/supabase/types';

type Store = Tables<'stores'>;

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

export function BrandingTab({ store, userId }: { store: Store; userId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: store.name,
    description: store.description ?? "",
    banner: getStoreBanner(store.id),
    whatsapp_number: store.whatsapp_number ?? "",
    pix_key: (store as any).pix_key ?? "",
    primary_color: store.primary_color || "#e11d48",
    logo_url: store.logo_url ?? "",
    favicon_url: store.logo_url ?? store.favicon_url ?? "",
    contact_email: store.contact_email ?? "",
    contact_instagram: store.contact_instagram ?? "",
    default_installment_due_day: store.default_installment_due_day?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => getStoreBrands(store.id));
  const [newCustomBrand, setNewCustomBrand] = useState("");

  function handleToggleBrand(brand: string) {
    let updated: string[];
    if (selectedBrands.includes(brand)) {
      updated = selectedBrands.filter((b) => b !== brand);
    } else {
      updated = [...selectedBrands, brand];
    }
    setSelectedBrands(updated);
    saveStoreBrands(store.id, updated);
  }

  function handleAddCustomBrand() {
    const trimmed = newCustomBrand.trim();
    if (!trimmed) return;
    if (selectedBrands.map((b) => b.toLowerCase()).includes(trimmed.toLowerCase())) {
      toast.info("Esta marca já está na sua lista.");
      setNewCustomBrand("");
      return;
    }
    const updated = [...selectedBrands, trimmed];
    setSelectedBrands(updated);
    saveStoreBrands(store.id, updated);
    setNewCustomBrand("");
    toast.success(`Marca "${trimmed}" adicionada!`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = form.name.trim();
    const cleanSlug = slugify(cleanName);
    if (!cleanSlug) return toast.error("Por favor, insira um nome válido para a loja.");

    setSaving(true);

    // Salvar marcas comercializadas e banner promocional
    saveStoreBrands(store.id, selectedBrands);
    saveStoreBanner(store.id, form.banner);

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
    const updatePayload: any = {
      name: cleanName,
      slug: cleanSlug,
      description: form.description.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() || null,
      primary_color: form.primary_color,
      logo_url: logo,
      favicon_url: logo,
      contact_email: form.contact_email.trim() || null,
      contact_instagram: form.contact_instagram.trim() || null,
    };
    if (form.pix_key.trim()) {
      updatePayload.pix_key = form.pix_key.trim();
    }
    
    if (form.default_installment_due_day.trim()) {
      const day = parseInt(form.default_installment_due_day.trim(), 10);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        updatePayload.default_installment_due_day = day;
      } else {
        updatePayload.default_installment_due_day = null;
      }
    } else {
      updatePayload.default_installment_due_day = null;
    }

    let { error } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", store.id);

    if (error && (error.code === "PGRST204" || error.message?.includes("pix_key") || (error as any).status === 400)) {
      delete updatePayload.pix_key;
      const retry = await supabase.from("stores").update(updatePayload).eq("id", store.id);
      error = retry.error;
    }

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

            <div className="space-y-1.5">
              <Label htmlFor="b-banner" className="flex items-center gap-1.5 font-semibold text-foreground">
                📢 Banner Promocional (Topo da Loja)
              </Label>
              <Input
                id="b-banner"
                maxLength={140}
                placeholder="Ex: 🔥 Reservas com opção de pagamento na chegada! Envio para todo o Brasil."
                value={form.banner}
                onChange={(e) => setForm({ ...form, banner: e.target.value })}
                className="bg-card"
              />
              <p className="text-[11px] text-muted-foreground">
                Se preenchido, será exibido um banner destacado no topo da sua loja pública.
              </p>
            </div>

            {/* SEÇÃO DE MARCAS COMERCIALIZADAS */}
            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4">
              <div>
                <Label className="text-base font-semibold">Marcas Comercializadas</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Marque quais marcas de miniaturas você vende na loja. Elas ficarão disponíveis no menu de seleção ao cadastrar pré-vendas.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                {DEFAULT_PRESET_BRANDS.map((presetBrand) => {
                  const isSelected = selectedBrands.includes(presetBrand);
                  return (
                    <button
                      key={presetBrand}
                      type="button"
                      onClick={() => handleToggleBrand(presetBrand)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm scale-105"
                          : "bg-background border border-border/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {isSelected ? "✓ " : "+ "}
                      {presetBrand}
                    </button>
                  );
                })}

                {/* Exibe marcas customizadas já adicionadas */}
                {selectedBrands
                  .filter((b) => !DEFAULT_PRESET_BRANDS.includes(b))
                  .map((customBrand) => (
                    <button
                      key={customBrand}
                      type="button"
                      onClick={() => handleToggleBrand(customBrand)}
                      className="rounded-full px-3 py-1 text-xs font-semibold bg-primary text-primary-foreground shadow-sm scale-105 flex items-center gap-1"
                    >
                      <span>✓ {customBrand}</span>
                      <span className="opacity-70 hover:opacity-100 ml-0.5">×</span>
                    </button>
                  ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Adicionar marca personalizada..."
                  value={newCustomBrand}
                  onChange={(e) => setNewCustomBrand(e.target.value)}
                  className="text-xs sm:text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomBrand();
                    }
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={handleAddCustomBrand} className="shrink-0">
                  <Plus className="size-4 mr-1" /> Adicionar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="b-whats">WhatsApp de Atendimento</Label>
              <PhoneInput
                id="b-whats"
                value={form.whatsapp_number}
                onChange={(val) => setForm({ ...form, whatsapp_number: val })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="b-email">E-mail de Contato</Label>
                <Input
                  id="b-email"
                  type="email"
                  placeholder="contato@sualoja.com.br"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  className="text-xs sm:text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="b-insta">Perfil do Instagram</Label>
                <Input
                  id="b-insta"
                  placeholder="@sualoja"
                  value={form.contact_instagram}
                  onChange={(e) => setForm({ ...form, contact_instagram: e.target.value })}
                  className="text-xs sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-pix">Chave PIX da Loja (para o cliente pagar o sinal/saldo)</Label>
              <Input
                id="b-pix"
                placeholder="Ex: CPF/CNPJ, E-mail, Telefone ou Chave Aleatória"
                value={form.pix_key}
                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                className="font-mono text-xs sm:text-sm"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="b-due-day" className="flex items-center gap-1.5 font-semibold text-foreground">
                Dia de Vencimento Padrão das Parcelas (Opcional)
              </Label>
              <Input
                id="b-due-day"
                type="number"
                min="1"
                max="31"
                placeholder="Ex: 10"
                value={form.default_installment_due_day}
                onChange={(e) => setForm({ ...form, default_installment_due_day: e.target.value })}
                className="w-full sm:w-[150px]"
              />
              <p className="text-[11px] text-muted-foreground">
                Se preenchido, todas as novas parcelas geradas pela loja (compras ou pré-vendas) 
                terão o vencimento fixado para o mês seguinte neste dia escolhido. 
                Se deixar em branco, o sistema usa 1 mês inteiro a partir da data do pedido.
              </p>
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

