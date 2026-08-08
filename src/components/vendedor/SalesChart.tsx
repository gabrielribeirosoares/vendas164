import { lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";

// Lazy-load do Recharts (~500KB) para reduzir o bundle inicial
const RechartsChart = lazy(() =>
  import("./RechartsChart").then((m) => ({ default: m.RechartsChart })),
);

const COLORS = ["#8b5cf6", "#d946ef", "#f43f5e", "#f97316", "#eab308"];

export function SalesChart({ brandData }: { brandData: { name: string; count: number }[] }) {
  return (
    <Card className="border-border/60 panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
          <Trophy className="size-4 text-primary" /> Top Marcas Reservadas
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[200px] w-full">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Carregando gráfico...
            </div>
          }
        >
          <RechartsChart brandData={brandData} colors={COLORS} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
