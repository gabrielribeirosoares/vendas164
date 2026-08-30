import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Car, CheckCircle2, Copy, Share2, ArrowRight, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

type Store = Tables<"stores">;

interface QuickStartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store;
  onSuccess: () => void;
}

const PRESET_TEMPLATES = [
  {
    brand: "Mini GT",
    model: "Nissan Skyline GT-R (R34) Kaido House #098",
    price: "169.90",
    down_payment: "30.00",
    stock: "6",
    scale: "1:64",
    image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80",
    tag: "Mais Popular",
  },
  {
    brand: "Hot Wheels",
    model: "Boulevard Porsche 911 GT3 RS",
    price: "79.90",
    down_payment: "20.00",
    stock: "10",
    scale: "1:64",
    image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80",
    tag: "Alta Demanda",
  },
  {
    brand: "Tarmac Works",
    model: "Pagani Zonda R Global64",
    price: "149.00",
    down_payment: "30.00",
    stock: "4",
    scale: "1:64",
    image: "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=600&q=80",
    tag: "Edição Especial",
  },
];

export function QuickStartModal({ open, onOpenChange, store, onSuccess }: QuickStartModalProps) {
  const [step, setStep] = useState<"template" | "form" | "success">("template");
  const [brand, setBrand] = useState("Mini GT");
  const [model, setModel] = useState("");
  const [price, setPrice] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [stock, setStock] = useState("5");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdProductSlug, setCreatedProductSlug] = useState("");

  const handleSelectTemplate = (t: typeof PRESET_TEMPLATES[0]) => {
    setBrand(t.brand);
    setModel(t.model);
    setPrice(t.price);
    setDownPayment(t.down_payment);
    setStock(t.stock);
    setImageUrl(t.image);
    setStep("form");
  };

  const handleStartBlank = () => {
    setBrand("Hot Wheels");
    setModel("");
    setPrice("");
    setDownPayment("");
    setStock("5");
    setImageUrl("");
    setStep("form");
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim() || !price) {
      toast.error("Preencha o modelo e o valor da miniatura.");
      return;
    }

    setLoading(true);
    try {
      const slug = slugify(`${brand}-${model}`);
      const priceNum = parseFloat(price.replace(",", "."));
      const downNum = downPayment ? parseFloat(downPayment.replace(",", ".") || "0") : 0;

      const insertData: any = {
        store_id: store.id,
        brand: brand.trim(),
        model: model.trim(),
        scale: "1:64",
        slug,
        price: priceNum,
        down_payment_amount: downNum > 0 ? downNum : null,
        stock: parseInt(stock, 10) || 1,
        image_url: imageUrl.trim() || null,
        payment_deadline_hours: 24,
      };

      const { data, error } = await supabase
        .from("products")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          const randomSlug = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
          insertData.slug = randomSlug;
          const { error: retryError } = await supabase.from("products").insert(insertData);
          if (retryError) throw retryError;
          setCreatedProductSlug(randomSlug);
        } else {
          throw error;
        }
      } else {
        setCreatedProductSlug(data?.slug || "");
      }

      toast.success("1ª miniatura cadastrada com sucesso!");
      setStep("success");
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao salvar miniatura: " + (err.message || "Erro inesperado"));
    } finally {
      setLoading(false);
    }
  };

  const productUrl = `${window.location.origin}/loja/${store.slug}/${createdProductSlug}`;

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-border/80 bg-card">
        {step === "template" && (
          <div className="p-6 space-y-6">
            <DialogHeader className="text-left space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold w-fit">
                <Zap className="size-3.5" /> Início Rápido em 60 Segundos
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight">
                Cadastre sua 1ª Pré-venda
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Escolha um modelo de exemplo para preencher com 1 clique ou comece do zero.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Exemplos Prontos para Testar:
              </p>
              <div className="grid gap-2.5">
                {PRESET_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectTemplate(tpl)}
                    className="flex items-center justify-between p-3 rounded-xl border border-border/60 hover:border-primary/50 bg-background/50 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-muted flex items-center justify-center font-bold text-xs text-primary border border-border/40 shrink-0">
                        {tpl.brand.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{tpl.brand} {tpl.model}</span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/30 text-primary">
                            {tpl.tag}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Preço: <strong>R$ {tpl.price}</strong> · Sinal: <strong>R$ {tpl.down_payment}</strong> · {tpl.stock} unid.
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-border/40">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs text-muted-foreground">
                Pular por enquanto
              </Button>
              <Button size="sm" variant="outline" onClick={handleStartBlank} className="text-xs gap-1">
                <Car className="size-3.5" /> Criar Minha Própria Miniatura
              </Button>
            </div>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSaveProduct} className="p-6 space-y-5">
            <DialogHeader className="text-left space-y-1">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="size-5 text-primary" /> Detalhes da Miniatura
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Revise os dados abaixo. Você poderá editar a qualquer momento depois.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="qs-brand" className="text-xs">Marca / Fabricante</Label>
                <Input
                  id="qs-brand"
                  placeholder="Ex: Mini GT, Kaido House"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="qs-stock" className="text-xs">Unidades Disponíveis</Label>
                <Input
                  id="qs-stock"
                  type="number"
                  min="1"
                  placeholder="Ex: 5"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="qs-model" className="text-xs">Modelo / Descrição da Miniatura</Label>
                <Input
                  id="qs-model"
                  placeholder="Ex: Nissan Skyline GT-R R34 Kaido House #98"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="qs-price" className="text-xs">Preço Total (R$)</Label>
                <Input
                  id="qs-price"
                  type="number"
                  step="0.01"
                  placeholder="169.90"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="qs-down" className="text-xs">Valor do Sinal PIX (R$)</Label>
                <Input
                  id="qs-down"
                  type="number"
                  step="0.01"
                  placeholder="30.00 (Opcional)"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="qs-img" className="text-xs">Link da Foto (Opcional)</Label>
                <Input
                  id="qs-img"
                  placeholder="https://... (URL da imagem)"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep("template")} className="text-xs">
                Voltar
              </Button>
              <Button type="submit" size="sm" className="glow font-semibold gap-1.5" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                Salvar e Ativar Minha Loja
              </Button>
            </div>
          </form>
        )}

        {step === "success" && (
          <div className="p-6 text-center space-y-6">
            <div className="mx-auto size-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="size-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-2xl font-black tracking-tight">Sua Loja está no Ar! 🎉</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Sua miniatura já está cadastrada e pronta para receber reservas com pagamento de sinal via PIX automático.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-left space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Link da sua miniatura:</span>
                <Badge variant="outline" className="text-[11px] border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                  Pronto para postar
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={productUrl} className="font-mono text-xs bg-background select-all" />
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0 gap-1"
                  onClick={() => copyToClipboard(productUrl, "Link da miniatura copiado!")}
                >
                  <Copy className="size-3.5" /> Copiar
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 shadow-lg shadow-emerald-500/20"
                onClick={() => {
                  const msg = encodeURIComponent(`Olá! Abri as reservas da pré-venda ${brand} ${model}! Garanta a sua pelo link oficial: ${productUrl}`);
                  window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
                }}
              >
                <Share2 className="size-4" /> Divulgar no WhatsApp
              </Button>
              <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                Acessar Painel Completo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
