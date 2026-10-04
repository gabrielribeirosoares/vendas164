import { useState, useRef, type ChangeEvent } from "react";
import { uploadImage } from "@/lib/upload";
import { getImageUploadErrorMessage } from "@/lib/imageOptimization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";

interface ProductPhotosInputProps {
  images: string[];
  onChange: (images: string[]) => void;
  userId: string;
  disabled?: boolean;
  maxImages?: number;
}

export function ProductPhotosInput({
  images,
  onChange,
  userId,
  disabled = false,
  maxImages = 8,
}: ProductPhotosInputProps) {
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || !fileList.length) return;

    const files = Array.from(fileList);
    const availableSlots = maxImages - images.length;

    if (availableSlots <= 0) {
      toast.error(`Limite de ${maxImages} fotos atingido para esta miniatura.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const filesToUpload = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      toast.warning(`Apenas ${availableSlots} foto(s) foram adicionadas para não ultrapassar o limite de ${maxImages}.`);
    }

    setUploading(true);
    const newUrls: string[] = [];

    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        setProgressText(`Enviando foto ${i + 1} de ${filesToUpload.length}...`);
        const url = await uploadImage(userId, filesToUpload[i], "product");
        newUrls.push(url);
      }

      onChange([...images, ...newUrls]);
      toast.success(
        filesToUpload.length > 1
          ? `${filesToUpload.length} fotos otimizadas e enviadas!`
          : "Foto otimizada e enviada com sucesso!"
      );
    } catch (error) {
      toast.error(getImageUploadErrorMessage(error));
    } finally {
      setUploading(false);
      setProgressText("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove(index: number) {
    const next = images.filter((_, idx) => idx !== index);
    onChange(next);
  }

  function handleSetCover(index: number) {
    if (index === 0) return;
    const target = images[index];
    const rest = images.filter((_, idx) => idx !== index);
    onChange([target, ...rest]);
    toast.success("Foto definida como capa principal da vitrine!");
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const next = [...images];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Camera className="size-3.5 text-primary" />
          Fotos da miniatura
        </label>
        <span className="text-[11px] font-medium text-muted-foreground">
          {images.length} de {maxImages} fotos
        </span>
      </div>

      {/* Grid de fotos atuais */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {images.map((url, idx) => {
            const isCover = idx === 0;
            return (
              <div
                key={`${url}-${idx}`}
                className={`group relative aspect-square rounded-xl overflow-hidden border-2 bg-muted/30 transition-all ${
                  isCover
                    ? "border-primary/80 ring-2 ring-primary/20 shadow-sm"
                    : "border-border/50 hover:border-border"
                }`}
              >
                <img
                  src={url}
                  alt={`Foto ${idx + 1}`}
                  className="size-full object-contain p-1.5"
                  loading="lazy"
                />

                {/* Badge Capa */}
                {isCover ? (
                  <Badge
                    variant="default"
                    className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 h-4.5 bg-primary text-primary-foreground font-semibold gap-1 shadow-sm"
                  >
                    <Star className="size-2.5 fill-current" /> Capa
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSetCover(idx)}
                    disabled={disabled || uploading}
                    className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 h-5 bg-background/90 backdrop-blur-sm hover:bg-background text-muted-foreground hover:text-foreground border border-border/40 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Definir esta foto como capa principal"
                  >
                    Definir Capa
                  </Button>
                )}

                {/* Botão de Excluir */}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  disabled={disabled || uploading}
                  className="absolute top-1.5 right-1.5 size-6 rounded-full bg-destructive/90 hover:bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Remover esta foto"
                  aria-label={`Remover foto ${idx + 1}`}
                >
                  <Trash2 className="size-3" />
                </button>

                {/* Controles de reordenação */}
                {images.length > 1 && (
                  <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      disabled={idx === 0 || disabled || uploading}
                      onClick={() => handleMove(idx, -1)}
                      className="size-6 rounded-md bg-background/90 backdrop-blur-sm hover:bg-background text-foreground flex items-center justify-center shadow-sm disabled:opacity-30 border border-border/40 cursor-pointer"
                      title="Mover para a esquerda"
                    >
                      <ChevronLeft className="size-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === images.length - 1 || disabled || uploading}
                      onClick={() => handleMove(idx, 1)}
                      className="size-6 rounded-md bg-background/90 backdrop-blur-sm hover:bg-background text-foreground flex items-center justify-center shadow-sm disabled:opacity-30 border border-border/40 cursor-pointer"
                      title="Mover para a direita"
                    >
                      <ChevronRight className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Botão / Input para adicionar fotos */}
      {images.length < maxImages && (
        <div>
          <input
            ref={inputRef}
            type="file"
            id="product-photos-input"
            accept="image/*"
            multiple
            disabled={disabled || uploading}
            onChange={handleFiles}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full h-11 border-dashed border-2 border-border/70 hover:border-primary/60 hover:bg-primary/5 text-xs font-medium gap-2 text-muted-foreground hover:text-foreground transition-all"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>{progressText || "Otimizando fotos..."}</span>
              </>
            ) : (
              <>
                <ImagePlus className="size-4 text-primary" />
                <span>
                  {images.length === 0
                    ? "Adicionar fotos da miniatura (selecione 1 ou várias)"
                    : "Adicionar mais fotos"}
                </span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Dica de usabilidade */}
      <p className="text-[11px] text-muted-foreground flex items-start gap-1 leading-relaxed">
        <Info className="size-3.5 shrink-0 mt-0.5 text-primary/70" />
        <span>
          A primeira foto é a capa da vitrine. Você pode publicar até {maxImages} fotos por miniatura (ex: frente, traseira, embalagem, base e detalhes).
        </span>
      </p>
    </div>
  );
}
