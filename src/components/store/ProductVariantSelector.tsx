import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getVariantAttributes, type ColorVariant } from "@/lib/productVariants";

type Dimension = "color" | "size" | "brake";
const dimensions: Dimension[] = ["color", "size", "brake"];
const labels = { color: "Cor", size: "Medida", brake: "Freio" };
export function ProductVariantSelector({
  variants,
  onChange,
}: {
  variants: ColorVariant[];
  onChange: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Partial<Record<Dimension, string>>>({});
  const activeDimensions = dimensions.filter((d) =>
    variants.some((v) => getVariantAttributes(v)[d]),
  );
  return (
    <fieldset className="mt-5 space-y-4">
      <legend className="text-sm font-semibold">Escolha as opções</legend>
      {activeDimensions.map((dimension, index) => {
        const prefix = activeDimensions.slice(0, index);
        const matchesPrefix = (v: ColorVariant) =>
          prefix.every(
            (d) => selected[d] === undefined || getVariantAttributes(v)[d] === selected[d],
          );
        const values = [...new Set(variants.map((v) => getVariantAttributes(v)[dimension]))];
        return (
          <div key={dimension} className="space-y-2">
            <p className="text-xs font-semibold">{labels[dimension]}</p>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const available = variants.some(
                  (v) =>
                    matchesPrefix(v) && getVariantAttributes(v)[dimension] === value && v.stock > 0,
                );
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={selected[dimension] === value ? "default" : "outline"}
                    aria-pressed={selected[dimension] === value}
                    disabled={!available}
                    onClick={() => {
                      const next: Partial<Record<Dimension, string>> = {};
                      for (const d of prefix) if (selected[d] !== undefined) next[d] = selected[d];
                      next[dimension] = value;
                      setSelected(next);
                      const ready = activeDimensions.every((d) => next[d] !== undefined);
                      const match = ready
                        ? variants.find((v) =>
                            activeDimensions.every((d) => getVariantAttributes(v)[d] === next[d]),
                          )
                        : undefined;
                      onChange(match?.id || "");
                    }}
                  >
                    {value || "Não se aplica"}
                    {!available ? " · Indisponível" : ""}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Escolha as opções para ver fotos, preço e estoque da combinação.
      </p>
    </fieldset>
  );
}
