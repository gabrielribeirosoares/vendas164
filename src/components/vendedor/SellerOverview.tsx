import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Wallet, Clock, DollarSign } from "lucide-react";
import { brl } from "@/lib/format";
import React from "react";
import { SalesChart } from "./SalesChart";

interface Totals {
  projected: number;
  received: number;
  pending: number;
  activeCount: number;
  avgTicket: number;
  paidInFull: number;
}

interface SellerOverviewProps {
  totals: Totals;
  brandData: { name: string; count: number }[];
}

export function SellerOverview({ totals, brandData }: SellerOverviewProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="size-4 text-primary" />}
          label="Total projetado"
          value={brl(totals.projected)}
          subtext={`${totals.activeCount} reservas ativas`}
        />
        <StatCard
          icon={<Wallet className="size-4 text-emerald-500" />}
          label="Valores recebidos"
          value={brl(totals.received)}
          accent="text-emerald-500"
          subtext={`${totals.paidInFull} pedidos quitados`}
        />
        <StatCard
          icon={<Clock className="size-4 text-amber-500" />}
          label="Saldo a receber"
          value={brl(totals.pending)}
          accent="text-amber-500"
          subtext="Restante a pagar"
        />
        <StatCard
          icon={<DollarSign className="size-4 text-blue-500" />}
          label="Ticket médio"
          value={brl(totals.avgTicket)}
          accent="text-blue-500"
          subtext="Média por reserva"
        />
      </div>

      <div className="mt-4">
        <SalesChart brandData={brandData} />
      </div>
    </>
  );
}

export function StatCard({
  icon,
  label,
  value,
  accent,
  subtext,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  subtext?: string;
}) {
  return (
    <Card className="relative min-w-0 overflow-hidden border-border/50 bg-card/70 shadow-sm transition-colors hover:border-border">
      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">{label}</p>
          {icon && <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/50">{icon}</div>}
        </div>
        <p className={`break-words font-display text-base font-bold leading-tight tracking-tight tabular-nums sm:text-xl ${accent ?? ""}`}>
          {value}
        </p>
        {subtext && <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{subtext}</p>}
      </CardContent>
    </Card>
  );
}
