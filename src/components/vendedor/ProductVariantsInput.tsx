import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductPhotosInput } from "./ProductPhotosInput";
import { getProductImageUrls } from "@/lib/imageUrls";
import type { ColorVariant } from "@/lib/productVariants";

export function ProductVariantsInput({
  value,
  onChange,
  userId,
  disabled,
}: {
  value: ColorVariant[];
  onChange: (value: ColorVariant[]) => void;
  userId: string;
  disabled?: boolean;
}) {
  const latestValue = useRef(value);
  latestValue.current = value;
  const update = (id: string, patch: Partial<ColorVariant>) =>
    onChange(latestValue.current.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border p-3">
      <legend className="px-1 text-sm font-semibold">Opções de cor</legend>
      <p className="text-xs text-muted-foreground">
        Use zero unidades para indisponibilizar uma cor que já possui pedidos.
      </p>
      <p className="text-xs text-muted-foreground">
        Todas as cores usam o preço do anúncio. O estoque total é a soma das cores.
      </p>
      {value.map((v, index) => (
        <div key={v.id} className="min-w-0 space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Cor
              <Input
                aria-label={`Cor ${index + 1}`}
                maxLength={60}
                placeholder="Ex.: Vermelho"
                value={v.name}
                onChange={(e) => update(v.id, { name: e.target.value })}
              />
            </label>
            <label className="text-xs">
              Unidades disponíveis
              <Input
                aria-label={`Estoque da cor ${index + 1}`}
                type="number"
                min={0}
                max={999999}
                step={1}
                value={v.stock}
                onChange={(e) => update(v.id, { stock: Number(e.target.value) })}
              />
            </label>
          </div>
          <ProductPhotosInput
            userId={userId}
            disabled={disabled}
            images={getProductImageUrls(v.image_url)}
            onChange={(images) =>
              update(v.id, {
                image_url: images.length > 1 ? JSON.stringify(images) : images[0] || null,
              })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(value.filter((x) => x.id !== v.id))}
          >
            Remover cor
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || value.length >= 40}
        onClick={() =>
          onChange([...value, { id: crypto.randomUUID(), name: "", stock: 0, image_url: null }])
        }
      >
        Adicionar cor
      </Button>
      {value.length > 0 && (
        <p className="text-xs font-medium">
          Estoque total: {value.reduce((sum, v) => sum + v.stock, 0)} unidades
        </p>
      )}
    </fieldset>
  );
}
