import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductPhotosInput } from "./ProductPhotosInput";
import { getProductImageUrls } from "@/lib/imageUrls";
import { getVariantLabel, type ColorVariant } from "@/lib/productVariants";

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
    onChange(
      latestValue.current.map((v) =>
        v.id === id ? { ...v, ...patch, name: getVariantLabel({ ...v, ...patch }) } : v,
      ),
    );
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border p-3">
      <legend className="px-1 text-sm font-semibold">Variações do produto</legend>
      <p className="text-xs text-muted-foreground">
        Use zero unidades para indisponibilizar uma combinação que já possui pedidos.
      </p>
      <p className="text-xs text-muted-foreground">
        Preencha apenas os campos necessários. Sem preço próprio, a combinação usa os valores do
        anúncio.
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
                value={v.color ?? v.name}
                onChange={(e) => update(v.id, { color: e.target.value })}
              />
            </label>
            <label className="text-xs">
              Medida (opcional)
              <Input
                aria-label={`Medida ${index + 1}`}
                placeholder="Ex.: 12 mm"
                maxLength={60}
                value={v.size ?? ""}
                onChange={(e) => update(v.id, { size: e.target.value })}
              />
            </label>
            <label className="text-xs">
              Freio (opcional)
              <select
                aria-label={`Freio ${index + 1}`}
                className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={v.brake ?? ""}
                onChange={(e) => update(v.id, { brake: e.target.value })}
              >
                <option value="">Não se aplica</option>
                <option value="Com freio">Com freio</option>
                <option value="Sem freio">Sem freio</option>
              </select>
            </label>
            <label className="text-xs">
              Preço próprio (opcional)
              <Input
                aria-label={`Preço ${index + 1}`}
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                placeholder="Preço do anúncio"
                value={v.price ?? ""}
                onChange={(e) =>
                  update(v.id, { price: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <label className="text-xs">
              Unidades disponíveis
              <Input
                aria-label={`Estoque da combinação ${index + 1}`}
                type="number"
                min={0}
                max={999999}
                step={1}
                value={v.stock}
                onChange={(e) => update(v.id, { stock: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Preço próprio vale à vista e parcelado, sem desconto por quantidade.
          </p>
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
            Remover combinação
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || value.length >= 40}
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              name: "",
              color: "",
              size: "",
              brake: "",
              price: null,
              stock: 0,
              image_url: null,
            },
          ])
        }
      >
        Adicionar combinação
      </Button>
      {value.length > 0 && (
        <p className="text-xs font-medium">
          Estoque total: {value.reduce((sum, v) => sum + v.stock, 0)} unidades
        </p>
      )}
    </fieldset>
  );
}
