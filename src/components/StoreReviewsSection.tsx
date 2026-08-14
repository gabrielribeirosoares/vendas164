import React, { useState } from "react";
import { Star, MessageSquarePlus, CheckCircle2, ShieldCheck } from "lucide-react";
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
} from "@/components/ui/dialog";
import { fetchStoreReviewsFromSupabase, saveStoreReviewToSupabase, getStoreReviews, type StoreReview } from "@/lib/storeCustomizations";

interface StoreReviewsSectionProps {
  storeId: string;
  storeName: string;
  primaryColor?: string;
}

export function StoreReviewsSection({ storeId, storeName, primaryColor = "#e11d48" }: StoreReviewsSectionProps) {
  const [reviews, setReviews] = useState<StoreReview[]>(() => getStoreReviews(storeId));

  React.useEffect(() => {
    fetchStoreReviewsFromSupabase(storeId).then(setReviews);
  }, [storeId]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [hoverRating, setHoverRating] = useState(0);

  const averageRating = (
    reviews.reduce((acc, r) => acc + r.rating, 0) / (reviews.length || 1)
  ).toFixed(1);

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!authorName.trim()) return toast.error("Por favor, digite seu nome.");
    if (!comment.trim()) return toast.error("Por favor, escreva um breve comentário.");

    const updated = await saveStoreReviewToSupabase(storeId, {
      author_name: authorName.trim(),
      rating,
      comment: comment.trim(),
    });

    setReviews(updated);
    setDialogOpen(false);
    setAuthorName("");
    setComment("");
    setRating(5);
    toast.success("Obrigado pela sua avaliação!");
  }

  return (
    <section className="mt-16 pt-8 border-t border-border/40">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Avaliações & Depoimentos
            </h2>
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <ShieldCheck className="size-3.5" /> 100% Verificado
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Veja a opinião de quem já comprou e reservou miniaturas na <strong>{storeName}</strong>.
          </p>
        </div>

        {/* Resumo de Estrelas & Botão */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-card/60 border border-border/30 rounded-xl px-3.5 py-2">
            <span className="text-lg font-bold text-foreground">{averageRating}</span>
            <div className="flex items-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`size-4 ${
                    i < Math.round(Number(averageRating))
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">({reviews.length})</span>
          </div>

          <Button
            onClick={() => setDialogOpen(true)}
            size="sm"
            className="gap-1.5 font-semibold text-xs h-10 shadow-sm"
            style={{ backgroundColor: primaryColor, color: "#fff" }}
          >
            <MessageSquarePlus className="size-4" />
            <span>Avaliar Loja</span>
          </Button>
        </div>
      </div>

      {/* Grid de Cards de Avaliação ou Estado Vazio */}
      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center space-y-3 bg-card/20">
          <Star className="mx-auto size-8 text-muted-foreground/30" />
          <h4 className="text-sm font-semibold text-foreground">Ainda não há avaliações para esta loja</h4>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Sua opinião é muito importante! Seja o primeiro colecionador a deixar um depoimento sobre a {storeName}.
          </p>
          <div className="pt-2">
            <Button
              onClick={() => setDialogOpen(true)}
              size="sm"
              style={{ backgroundColor: primaryColor, color: "#fff" }}
              className="gap-1.5 font-semibold text-xs h-9"
            >
              <MessageSquarePlus className="size-4" />
              <span>Deixar Primeira Avaliação</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((rev) => (
            <Card key={rev.id} className="border-border/30 bg-card/50 backdrop-blur-sm shadow-sm flex flex-col justify-between">
              <CardContent className="p-4 space-y-3">
                {/* Estrelas + Data */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`size-3.5 ${
                          i < rev.rating
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/20"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{rev.created_at}</span>
                </div>

                {/* Comentário */}
                <p className="text-xs text-foreground/90 leading-relaxed italic">
                  "{rev.comment}"
                </p>

                {/* Autor */}
                <div className="flex items-center justify-between pt-1 border-t border-border/20">
                  <div className="flex items-center gap-1.5">
                    <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {rev.author_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-foreground">{rev.author_name}</span>
                  </div>
                  {rev.verified_purchase && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-3" /> Compra Verificada
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal para Deixar Avaliação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md border-border/30 bg-card/95">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Star className="size-5 text-amber-400 fill-amber-400" /> Deixar uma avaliação para {storeName}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmitReview} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="rev-name" className="text-xs font-medium text-muted-foreground">Seu Nome / Apelido</Label>
              <Input
                id="rev-name"
                required
                maxLength={40}
                placeholder="Ex: João Colecionador"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="bg-muted/20 border-border/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Sua Nota</Label>
              <div className="flex items-center gap-1 pt-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const starValue = i + 1;
                  return (
                    <button
                      type="button"
                      key={starValue}
                      onClick={() => setRating(starValue)}
                      onMouseEnter={() => setHoverRating(starValue)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`size-7 ${
                          starValue <= (hoverRating || rating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="text-xs font-bold ml-2 text-foreground">{hoverRating || rating} / 5</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rev-comment" className="text-xs font-medium text-muted-foreground">Seu Comentário / Depoimento</Label>
              <Textarea
                id="rev-comment"
                required
                maxLength={240}
                placeholder="Conte como foi sua experiência com o atendimento, embalagem ou velocidade da entrega..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="bg-muted/20 border-border/30 min-h-[90px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor, color: "#fff" }}>
                Publicar Avaliação
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
